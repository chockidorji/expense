/* eslint-disable no-console */
// Re-run the keyword categorizer on all existing transactions.
// Transactions with a user-set CategoryOverride are respected — the override
// wins over keyword matches.
//
// By default only updates rows currently tagged "uncategorized". Pass --all to
// re-evaluate every transaction (use after tweaking the keyword map).
//
// Usage:
//   pnpm tsx --env-file=.env.local --env-file=.env scripts/recategorize.ts
//   pnpm tsx --env-file=.env.local --env-file=.env scripts/recategorize.ts --all
//   pnpm tsx --env-file=.env.local --env-file=.env scripts/recategorize.ts --dry

import { prisma, forUser } from "../lib/db";
import { categorizeByKeywords } from "../lib/categorizer";

const ALL = process.argv.includes("--all");
const DRY = process.argv.includes("--dry");

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  for (const user of users) {
    const txns = await forUser(user.id).transaction.findMany({
      where: ALL ? {} : { category: "uncategorized" },
      select: { id: true, merchantNormalized: true, category: true },
    });

    const overrideRows = await forUser(user.id).categoryOverride.findMany({});
    const overrideMap = new Map(overrideRows.map(o => [o.merchantNormalized, o.category]));

    let updated = 0;
    const bucket = new Map<string, number>();
    for (const t of txns) {
      const target = overrideMap.get(t.merchantNormalized) ?? categorizeByKeywords(t.merchantNormalized);
      if (target === t.category) continue;
      bucket.set(target, (bucket.get(target) ?? 0) + 1);
      if (!DRY) {
        await forUser(user.id).transaction.update({ where: { id: t.id }, data: { category: target } });
      }
      updated++;
    }

    console.log(`[${user.email}] ${ALL ? "all" : "uncategorized"}: ${txns.length} examined, ${updated} ${DRY ? "would move" : "moved"}`);
    for (const [cat, n] of Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  → ${cat}: ${n}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
