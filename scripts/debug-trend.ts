/* eslint-disable no-console */
import { prisma, forUser } from "../lib/db";
import { TxnType } from "@prisma/client";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Kolkata";

async function main() {
  const from = fromZonedTime(new Date(2025, 11, 1, 0, 0, 0, 0), TZ);
  const to = fromZonedTime(new Date(2025, 11, 31, 23, 59, 59, 999), TZ);
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("no user");

  const rows = await forUser(user.id).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    select: { amount: true, transactionDate: true },
  });
  console.log("row count:", rows.length);

  const fmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
  function istDayKey(d: Date) { return fmt.format(d); }

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = istDayKey(r.transactionDate);
    counts[k] = (counts[k] ?? 0) + Number(r.amount);
  }

  console.log("--- buckets ---");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ₹${Math.round(v)}`);

  console.log("\n--- sample raw dates ---");
  for (const r of rows.slice(0, 5)) {
    console.log("  utc iso:", r.transactionDate.toISOString(), "key:", istDayKey(r.transactionDate));
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
