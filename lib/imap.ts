/**
 * Gmail-via-IMAP source. Replaces the googleapis / OAuth pipeline because
 * unverified OAuth apps with sensitive scopes (gmail.readonly) get refresh
 * tokens revoked every ~3–7 days, no matter Testing vs Production status.
 * App passwords don't have that policy — they live until you explicitly
 * revoke at myaccount.google.com/apppasswords.
 *
 * Auth: IMAP_USER (Gmail address) + IMAP_APP_PASSWORD (16-char app password).
 * Both required. Set in /var/www/expense-tracker/.env on prod.
 *
 * Search: SINCE <date> via IMAP, then client-side filter. We do NOT use
 * Gmail's X-GM-RAW extension because (a) it makes the code Gmail-specific
 * and (b) the SINCE+filter path is fast enough — typical bank/subscription
 * email volume is tiny.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { allBankSenderAddresses } from "./parsers";

export type EmailMessage = {
  subject: string;
  from: string;
  date: Date | undefined;
  plainText: string;
  htmlText: string;
  /** Stable per-mailbox ID. Stored in Transaction.gmailMessageId for dedup. */
  uid: string;
};

export class ImapAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImapAuthError";
  }
}

export type FetchEmailsOpts = {
  user: string;
  appPassword: string;
  newerThanDays: number;
  /** Return true to keep the email; false to skip. Applied after parse. */
  filter?: (msg: EmailMessage) => boolean;
};

/**
 * Connect to Gmail IMAP, fetch INBOX messages SINCE `newerThanDays` ago,
 * yield each one parsed (and optionally filtered).
 *
 * Throws `ImapAuthError` if the app password is wrong / revoked.
 */
export async function* fetchEmails(opts: FetchEmailsOpts): AsyncGenerator<EmailMessage> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: opts.user, pass: opts.appPassword },
    logger: false,
    // Gmail's IMAP is slow on first connect — give it room.
    socketTimeout: 30_000,
  });

  try {
    await client.connect();
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/invalid credentials|authentication failed|auth/i.test(msg)) {
      throw new ImapAuthError(`IMAP auth failed: ${msg}`);
    }
    throw e;
  }

  try {
    await client.mailboxOpen("INBOX");

    // IMAP SINCE is date-only (no time component). Subtract 1 extra day to
    // guard against TZ rounding — duplicates are harmless (caught by the
    // unique constraint on Transaction).
    const since = new Date(Date.now() - (opts.newerThanDays + 1) * 86400e3);

    const uids = (await client.search({ since }, { uid: true })) || [];

    for (const uid of uids) {
      const raw = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!raw || !raw.source) continue;

      // mailparser handles MIME boundaries, encoded headers, charset issues.
      const parsed = await simpleParser(raw.source);
      const msg: EmailMessage = {
        subject: parsed.subject ?? "",
        from: parsed.from?.text ?? "",
        date: parsed.date ?? undefined,
        plainText: parsed.text ?? "",
        htmlText: typeof parsed.html === "string" ? parsed.html : "",
        uid: String(uid),
      };

      if (opts.filter && !opts.filter(msg)) continue;
      yield msg;
    }
  } finally {
    try { await client.logout(); } catch { /* best-effort cleanup */ }
  }
}

const BANK_SENDERS = allBankSenderAddresses().map((s) => s.toLowerCase());

function matchesBankSender(fromHeader: string): boolean {
  const lower = fromHeader.toLowerCase();
  return BANK_SENDERS.some((s) => lower.includes(s));
}

/**
 * Stream Gmail bank-alert emails (HDFC, ICICI, etc.). Wraps `fetchEmails`
 * with a sender allowlist drawn from `lib/parsers`.
 */
export function fetchBankEmails(opts: {
  user: string;
  appPassword: string;
  newerThanDays: number;
}): AsyncGenerator<EmailMessage> {
  return fetchEmails({
    ...opts,
    filter: (msg) => matchesBankSender(msg.from),
  });
}
