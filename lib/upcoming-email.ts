/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Upcoming-payment detector from Gmail. Parallel to the transaction-email
 * pipeline in gmail-sync.ts — this one looks at *future* charges:
 *   - subscription renewal notices (Apple, Google, Hostinger, …)
 *   - credit-card statement emails with "Total Amount Due" / "Payment Due Date"
 *   - utility / telecom bill emails ("Bill ready", "Payment due on …")
 *
 * Match rules are deliberately loose (keyword + regex) so we catch the long
 * tail. False-positive cost is low — a DISMISSED row disappears on the next
 * prune pass.
 */

import { prisma } from "./db";
import { fetchEmails, ImapAuthError, EmailMessage } from "./imap";
import { normalizeMerchant } from "./dedup";
import { UpcomingSource, UpcomingStatus, Prisma } from "@prisma/client";

type Match = {
  merchant: string;
  amount: number;
  dueDate: Date;
  category: string | null;
  confidence: number;
  messageId: string;
  subject: string;
  fromHeader: string;
};

// IMAP doesn't have Gmail's X-GM-RAW search; do the same OR-of-keywords/senders
// match client-side. Cheaper to filter in JS — bank-alert volume is small.
const SUBJECT_KEYWORDS = [
  "renewal", "renew", "due date", "payment due", "bill amount",
  "amount due", "statement", "invoice", "subscription",
];
const UPCOMING_SENDER_SUBSTRINGS = [
  "no_reply@email.apple.com",
  "@hostinger.com",
  "@netflix.com",
  "@sonyliv.com",
  "@jio.com",
  "@airtel.com",
  "@vodafone.com",
  "@hdfcbank.net",
  "@icicibank.com",
  "@axisbank.com",
  "@kotak.com",
];

function isUpcomingCandidate(msg: EmailMessage): boolean {
  const subj = msg.subject.toLowerCase();
  if (SUBJECT_KEYWORDS.some((k) => subj.includes(k))) return true;
  const from = msg.from.toLowerCase();
  return UPCOMING_SENDER_SUBSTRINGS.some((s) => from.includes(s));
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function findAmount(text: string): number | null {
  // Match "Rs 1,234.56", "₹ 1234", "INR 500.00" — return the LARGEST plausible
  // one in the body (statements list many smaller line items; the total due is
  // usually the biggest number). Cap at 10L to avoid referencing random
  // statement text accidentally.
  const candidates: number[] = [];
  const re = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 1 && n < 10_00_000) candidates.push(n);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function findDate(text: string): Date | null {
  // Prefer an explicit "due date", "on 12 May 2026", etc.
  // Pattern 1: "due date: 22/05/2026" or "02-05-2026"
  const dmy = text.match(
    /(?:due(?:\s*date)?|payment\s*due|renew(?:s|al)?\s*on|bill\s*date)[^\d]{0,20}(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})/i
  );
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]) - 1;
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const out = new Date(Date.UTC(y, m, d));
    if (!Number.isNaN(out.getTime())) return out;
  }
  // Pattern 2: "on 22 May 2026" / "22nd May 2026"
  const mdy = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (mdy) {
    const d = Number(mdy[1]);
    const mon = MONTHS[mdy[2].toLowerCase()];
    const y = Number(mdy[3]);
    if (mon !== undefined) {
      const out = new Date(Date.UTC(y, mon, d));
      if (!Number.isNaN(out.getTime())) return out;
    }
  }
  // Pattern 3: "May 22, 2026"
  const ymd = text.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (ymd) {
    const mon = MONTHS[ymd[1].toLowerCase()];
    const d = Number(ymd[2]);
    const y = Number(ymd[3]);
    if (mon !== undefined) {
      const out = new Date(Date.UTC(y, mon, d));
      if (!Number.isNaN(out.getTime())) return out;
    }
  }
  return null;
}

function brandFromSender(fromHeader: string, subject: string): { merchant: string; category: string | null } {
  const lower = `${fromHeader} ${subject}`.toLowerCase();
  const brands: Array<[string, string, string | null]> = [
    ["apple.com", "Apple", "subscriptions"],
    ["hostinger", "Hostinger", "subscriptions"],
    ["netflix", "Netflix", "subscriptions"],
    ["sonyliv", "SonyLIV", "subscriptions"],
    ["spotify", "Spotify", "subscriptions"],
    ["hdfcbank", "HDFC Credit Card", "bills"],
    ["icicibank", "ICICI Credit Card", "bills"],
    ["axisbank", "Axis Credit Card", "bills"],
    ["kotak", "Kotak Credit Card", "bills"],
    ["jio", "Jio", "bills"],
    ["airtel", "Airtel", "bills"],
    ["vodafone", "Vodafone", "bills"],
  ];
  for (const [needle, merchant, category] of brands) {
    if (lower.includes(needle)) return { merchant, category };
  }
  // Fall back to display-name portion of From header: "Hostinger <no-reply@...>"
  const nameMatch = fromHeader.match(/^"?([^"<]+?)"?\s*</);
  if (nameMatch && nameMatch[1].trim()) return { merchant: nameMatch[1].trim(), category: null };
  return { merchant: "Upcoming payment", category: null };
}

export async function scanUpcomingFromGmail(userId: string): Promise<{
  fetched: number;
  matched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  newMatches: Match[];
}> {
  const newMatches: Match[] = [];
  const result = { fetched: 0, matched: 0, inserted: 0, skipped: 0, errors: [] as string[], newMatches };

  const imapUser = process.env.IMAP_USER;
  const imapPassword = process.env.IMAP_APP_PASSWORD;
  if (!imapUser || !imapPassword) {
    result.errors.push("IMAP creds not configured");
    return result;
  }

  // X-GM-RAW server-side filter to keep the fetched-body count manageable.
  // Mirror the keyword + sender match we do client-side in isUpcomingCandidate.
  const subjectQuery = SUBJECT_KEYWORDS.map((k) => `"${k}"`).join(" OR ");
  const senderQuery = UPCOMING_SENDER_SUBSTRINGS.join(" OR ");
  const gmailRaw = `(subject:(${subjectQuery}) OR from:(${senderQuery}))`;

  try {
    for await (const msg of fetchEmails({
      user: imapUser,
      appPassword: imapPassword,
      newerThanDays: 60,
      gmailRaw,
      filter: isUpcomingCandidate,
    })) {
      result.fetched++;
      const subject = msg.subject;
      const fromHeader = msg.from;
      const body = msg.plainText || msg.htmlText;
      const text = `${subject}\n${body}`.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

      const amount = findAmount(text);
      const dueDate = findDate(text);
      if (!amount || !dueDate) {
        result.skipped++;
        continue;
      }
      // Ignore past dates (>14d overdue) and far-future (>90d out).
      const now = Date.now();
      const d = dueDate.getTime();
      if (d < now - 14 * 86400e3 || d > now + 90 * 86400e3) {
        result.skipped++;
        continue;
      }

      const { merchant, category } = brandFromSender(fromHeader, subject);
      result.matched++;

      try {
        const created = await prisma.upcomingPayment.create({
          data: {
            userId,
            merchant,
            merchantNormalized: normalizeMerchant(merchant),
            amount: new Prisma.Decimal(amount),
            dueDate: new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())),
            category,
            source: UpcomingSource.EMAIL,
            status: UpcomingStatus.PENDING,
            emailMessageId: msg.uid,
            confidence: 80,
            note: subject.slice(0, 140) || null,
          },
        });
        result.inserted++;
        newMatches.push({ merchant, amount, dueDate, category, confidence: 80, messageId: msg.uid, subject, fromHeader });
        void created;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          // Already seen this email — skip silently.
          result.skipped++;
          continue;
        }
        result.errors.push(`insert ${msg.uid}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    if (e instanceof ImapAuthError) {
      result.errors.push(`imap auth: ${e.message}`);
    } else {
      result.errors.push(`imap fetch: ${(e as Error).message}`);
    }
  }

  return result;
}
