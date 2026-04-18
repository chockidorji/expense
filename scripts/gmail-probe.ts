/* eslint-disable no-console */
import { prisma } from "../lib/db";
import { getGmailClient, extractPlainText, extractHtml, getHeader } from "../lib/gmail";

const QUERY = process.argv[2] ?? "from:(hdfcbank.net OR sbi.co.in OR icicibank.com OR axisbank.com OR kotak.com) newer_than:30d";
const MAX = Number(process.argv[3] ?? 20);
const DUMP_FULL = process.argv.includes("--full");

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user");
  console.log(`[probe] userId=${user.id} email=${user.email}`);
  console.log(`[probe] query: ${QUERY}`);
  const gmail = await getGmailClient(user.id);
  if (!gmail) throw new Error("No Gmail client");
  const list = await gmail.users.messages.list({ userId: "me", q: QUERY, maxResults: MAX });
  const ids = list.data.messages ?? [];
  console.log(`[probe] matched ${ids.length} messages`);
  for (const m of ids) {
    if (!m.id) continue;
    const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
    const p = full.data.payload ?? undefined;
    const subject = getHeader(p?.headers ?? undefined, "Subject");
    const from = getHeader(p?.headers ?? undefined, "From");
    const date = getHeader(p?.headers ?? undefined, "Date");
    const plain = extractPlainText(p);
    console.log("\n=== " + m.id + " ===");
    console.log("From:    " + from);
    console.log("Subject: " + subject);
    console.log("Date:    " + date);
    const html = extractHtml(p);
    const htmlToText = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (DUMP_FULL) {
      console.log("--- plain ---");
      console.log(plain || "(empty)");
      console.log("--- html-to-text ---");
      console.log(htmlToText || "(empty)");
    } else {
      console.log("plain(150): " + plain.replace(/\s+/g, " ").slice(0, 150));
      console.log("html  (200): " + htmlToText.slice(0, 200));
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
