import { prisma, forUser } from "./db";
import { getGmailClient, extractPlainText, extractHtml, getHeader } from "./gmail";
import { detectBankAndParse, allBankSenderQuery } from "./parsers";
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

export async function syncUserGmail(userId: string, newerThanDays = 1): Promise<SyncResult> {
  const result: SyncResult = { userId, fetched: 0, parsed: 0, inserted: 0, duplicates: 0, unrecognized: 0, errors: [] };
  let gmail;
  try {
    gmail = await getGmailClient(userId);
    if (!gmail) { result.errors.push("No Gmail client (not linked or needsReauth)"); return result; }
  } catch (e) {
    result.errors.push(`Gmail client error: ${(e as Error).message}`);
    return result;
  }

  let list;
  try {
    list = await gmail.users.messages.list({ userId: "me", q: allBankSenderQuery(newerThanDays), maxResults: 100 });
  } catch (e: any) {
    // Two distinct re-auth conditions Google can throw:
    //  - 401 / invalid_grant  → token revoked or refresh failed
    //  - 403 insufficient_authentication_scopes → user re-authed but the new
    //    grant no longer carries gmail.readonly (e.g. they removed the app at
    //    myaccount.google.com/permissions, or the consent screen lost it).
    // Both require user action; both should flip the dashboard banner.
    const code = e?.code ?? e?.response?.status;
    const oauthError = e?.response?.data?.error;
    const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason;
    const msg = String(e?.message ?? "").toLowerCase();
    const isInvalidGrant = oauthError === "invalid_grant" || code === 401;
    const isInsufficientScope = code === 403 && (
      reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
      msg.includes("insufficient authentication scopes") ||
      msg.includes("insufficient scope")
    );
    if (isInvalidGrant || isInsufficientScope) {
      const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
      if (account) {
        const update: Record<string, unknown> = { needsReauth: true };
        // For the insufficient_scope case the DB-stored scope can be stale —
        // it was written when gmail.readonly WAS granted, but the live token
        // has since lost it. Overwrite scope with what Google's tokeninfo
        // actually returns now, so the dashboard banner can render the
        // specific "tick the Gmail box" copy instead of generic "expired".
        if (isInsufficientScope) {
          try {
            const { decrypt } = await import("./crypto");
            const accessTok = decrypt(account.access_token!);
            const r = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(accessTok));
            if (r.ok) {
              const j: { scope?: string } = await r.json();
              if (typeof j.scope === "string") update.scope = j.scope;
            }
          } catch (probeErr) {
            console.warn("[gmail-sync] tokeninfo probe failed", probeErr);
          }
        }
        await prisma.account.update({ where: { id: account.id }, data: update });
      }
      result.errors.push(isInsufficientScope
        ? "insufficient_scope — gmail.readonly missing, needs reauth"
        : "invalid_grant — needs reauth");
      return result;
    }
    result.errors.push(`list error: ${e.message}`);
    return result;
  }

  const ids = list.data.messages ?? [];
  result.fetched = ids.length;

  for (const m of ids) {
    if (!m.id) continue;
    const existing = await forUser(userId).transaction.findFirst({ where: { gmailMessageId: m.id } });
    if (existing) continue;
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
      const payload = full.data.payload ?? undefined;
      const subject = getHeader(payload?.headers ?? undefined, "Subject");
      const fromHeader = getHeader(payload?.headers ?? undefined, "From");
      const dateHeader = getHeader(payload?.headers ?? undefined, "Date");
      const emailDate = dateHeader ? new Date(dateHeader) : undefined;
      const plainText = extractPlainText(payload);
      const htmlText = extractHtml(payload);
      const parsed = detectBankAndParse({ subject, fromHeader, plainText, htmlText, emailDate: emailDate && !isNaN(emailDate.getTime()) ? emailDate : undefined });
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
        gmailMessageId: m.id,
        rawData: { bank: parsed.bank, subject, fromHeader } as any,
      });
      if (out.status === "inserted") result.inserted++; else result.duplicates++;
    } catch (e) {
      result.errors.push(`msg ${m.id}: ${(e as Error).message}`);
    }
  }

  // After each sync, refresh the user's upcoming-payment predictions so newly
  // arrived transactions either close out a prediction or shift the cadence.
  if (result.inserted > 0) {
    try {
      await refreshUpcomingForUser(userId);
    } catch (e) {
      result.errors.push(`upcoming refresh failed: ${(e as Error).message}`);
    }
  }

  // Also scan Gmail for upcoming-payment signals (renewal notices, CC
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

export async function syncAllUsers(): Promise<SyncResult[]> {
  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: "google", needsReauth: false, refresh_token: { not: null } } } },
    select: { id: true },
  });
  const results: SyncResult[] = [];
  for (const u of users) results.push(await syncUserGmail(u.id));
  return results;
}
