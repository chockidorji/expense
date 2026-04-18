import { prisma, forUser } from "./db";
import { getGmailClient, extractPlainText, extractHtml, getHeader } from "./gmail";
import { detectBankAndParse, allBankSenderQuery } from "./parsers";
import { normalizeMerchant, insertOrLog } from "./dedup";
import { categorize } from "./categorizer";
import { TxnSource } from "@prisma/client";

export type SyncResult = {
  userId: string;
  fetched: number;
  parsed: number;
  inserted: number;
  duplicates: number;
  unrecognized: number;
  errors: string[];
};

export async function syncUserGmail(userId: string): Promise<SyncResult> {
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
    list = await gmail.users.messages.list({ userId: "me", q: allBankSenderQuery(), maxResults: 100 });
  } catch (e: any) {
    if (e?.response?.data?.error === "invalid_grant" || e?.code === 401) {
      const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
      if (account) await prisma.account.update({ where: { id: account.id }, data: { needsReauth: true } });
      result.errors.push("invalid_grant — needs reauth");
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
      const plainText = extractPlainText(payload);
      const htmlText = extractHtml(payload);
      const parsed = detectBankAndParse({ subject, fromHeader, plainText, htmlText });
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
