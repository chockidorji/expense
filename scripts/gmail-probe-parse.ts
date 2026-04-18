/* eslint-disable no-console */
import { prisma } from "../lib/db";
import { getGmailClient, extractPlainText, extractHtml, getHeader } from "../lib/gmail";
import { detectBankAndParse } from "../lib/parsers";

const QUERY = process.argv[2] ?? "from:hdfcbank newer_than:90d";
const MAX = Number(process.argv[3] ?? 50);

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user");
  console.log(`[probe-parse] userId=${user.id} query=${QUERY}`);
  const gmail = await getGmailClient(user.id);
  if (!gmail) throw new Error("No Gmail client");
  const list = await gmail.users.messages.list({ userId: "me", q: QUERY, maxResults: MAX });
  const ids = list.data.messages ?? [];
  console.log(`[probe-parse] matched ${ids.length} messages\n`);
  let parsed = 0, unrecognized = 0;
  const unrecognizedSamples: string[] = [];
  for (const m of ids) {
    if (!m.id) continue;
    const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
    const p = full.data.payload ?? undefined;
    const subject = getHeader(p?.headers ?? undefined, "Subject");
    const from = getHeader(p?.headers ?? undefined, "From");
    const plainText = extractPlainText(p);
    const htmlText = extractHtml(p);
    const result = detectBankAndParse({ fromHeader: from, subject, plainText, htmlText });
    if (result) {
      parsed++;
      console.log(`PARSED [${result.type}] ₹${result.amount} | ${result.merchant} | ${result.bank} | acc=${result.bankAccount ?? "-"}`);
    } else {
      unrecognized++;
      if (unrecognizedSamples.length < 3) {
        const combined = (plainText && plainText.trim()) ? plainText : htmlText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        unrecognizedSamples.push(`--- ${subject} ---\n${combined.slice(0, 500)}`);
      }
    }
  }
  console.log(`\n[probe-parse] ${parsed}/${ids.length} parsed, ${unrecognized} unrecognized`);
  if (unrecognizedSamples.length > 0) {
    console.log("\n[unrecognized samples]");
    unrecognizedSamples.forEach(s => console.log("\n" + s));
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
