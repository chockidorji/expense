import { prisma, forUser } from "./db";
import { fetchBankEmails, ImapAuthError } from "./imap";
import { detectBankAndParse } from "./parsers";
import { normalizeMerchant, insertOrLog } from "./dedup";
import { categorize } from "./categorizer";
import { TxnSource } from "@prisma/client";
import { refreshUpcomingForUser } from "./upcoming-sync";
import { scanUpcomingFromGmail } from "./upcoming-email";
import { notifyNewEmailUpcoming } from "./upcoming-notify";

export type SyncResult = {
  userId: string;
  fetched: number;
  parsed: number;
  inserted: number;
  duplicates: number;
  unrecognized: number;
  errors: string[];
};

/**
 * Sync one user's bank-alert emails via IMAP + app password.
 *
 * Architecture note: Previously this used googleapis with OAuth2 refresh
 * tokens. That path was abandoned because unverified apps requesting
 * gmail.readonly (a sensitive scope) get refresh tokens revoked by Google
 * every ~3–7 days regardless of Testing/Production publishing status. App
 * passwords don't have that policy — they only die on explicit revoke.
 */
export async function syncUserGmail(userId: string, newerThanDays = 1): Promise<SyncResult> {
  const result: SyncResult = { userId, fetched: 0, parsed: 0, inserted: 0, duplicates: 0, unrecognized: 0, errors: [] };

  const imapUser = process.env.IMAP_USER;
  const imapPassword = process.env.IMAP_APP_PASSWORD;
  if (!imapUser || !imapPassword) {
    result.errors.push("IMAP_USER and IMAP_APP_PASSWORD env vars must be set");
    return result;
  }

  let count = 0;
  try {
    for await (const msg of fetchBankEmails({ user: imapUser, appPassword: imapPassword, newerThanDays })) {
      count++;
      const existing = await forUser(userId).transaction.findFirst({ where: { gmailMessageId: msg.uid } });
      if (existing) continue;

      try {
        const parsed = detectBankAndParse({
          subject: msg.subject,
          fromHeader: msg.from,
          plainText: msg.plainText,
          htmlText: msg.htmlText,
          emailDate: msg.date && !isNaN(msg.date.getTime()) ? msg.date : undefined,
        });
        if (!parsed) { result.unrecognized++; continue; }
        result.parsed++;

        const merchantNormalized = normalizeMerchant(parsed.merchant);
        const category = await categorize(userId, merchantNormalized);
        const out = await insertOrLog(userId, {
          amount: parsed.amount,
          transactionDate: parsed.transactionDate,
          merchant: parsed.merchant,
          merchantNormalized,
          category,
          type: parsed.type,
          source: TxnSource.EMAIL,
          bankAccount: parsed.bankAccount ?? null,
          referenceNumber: parsed.referenceNumber ?? null,
          gmailMessageId: msg.uid,
          rawData: { bank: parsed.bank, subject: msg.subject, fromHeader: msg.from } as unknown as object,
        });
        if (out.status === "inserted") result.inserted++; else result.duplicates++;
      } catch (e) {
        result.errors.push(`msg ${msg.uid}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    if (e instanceof ImapAuthError) {
      // IMAP creds invalid → user must regenerate the app password.
      // Mark the Google account row as needsReauth so the dashboard banner
      // still surfaces this, even though the actual fix is IMAP not OAuth.
      result.errors.push(`IMAP auth failed — regenerate app password: ${e.message}`);
      try {
        const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
        if (account) await prisma.account.update({ where: { id: account.id }, data: { needsReauth: true } });
      } catch { /* best-effort */ }
      return result;
    }
    result.errors.push(`imap fetch error: ${(e as Error).message}`);
    return result;
  }
  result.fetched = count;

  // After each sync, refresh the user's upcoming-payment predictions so newly
  // arrived transactions either close out a prediction or shift the cadence.
  if (result.inserted > 0) {
    try {
      await refreshUpcomingForUser(userId);
    } catch (e) {
      result.errors.push(`upcoming refresh failed: ${(e as Error).message}`);
    }
  }

  // Also scan emails for upcoming-payment signals (renewal notices, CC
  // statements, utility bills). Anything new → Telegram ping immediately.
  try {
    const scan = await scanUpcomingFromGmail(userId);
    if (scan.newMatches.length > 0) {
      await notifyNewEmailUpcoming(userId, scan.newMatches);
    }
    if (scan.errors.length) result.errors.push(...scan.errors.map(e => `email-scan: ${e}`));
  } catch (e) {
    result.errors.push(`email-scan failed: ${(e as Error).message}`);
  }

  return result;
}

/**
 * IMAP path is single-user (one mailbox per env-configured credential). To
 * avoid running the sync N times against the same mailbox, we look up the
 * one user whose email matches IMAP_USER. Users without a matching account
 * get nothing — same effect as the old `needsReauth: false` filter.
 */
export async function syncAllUsers(): Promise<SyncResult[]> {
  const imapUser = process.env.IMAP_USER;
  if (!imapUser) return [];
  const user = await prisma.user.findFirst({ where: { email: imapUser }, select: { id: true } });
  if (!user) return [];
  return [await syncUserGmail(user.id)];
}
