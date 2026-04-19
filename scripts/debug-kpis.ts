/* eslint-disable no-console */
import { prisma, forUser } from "../lib/db";
import { TxnType } from "@prisma/client";
import { getMonthKpis, parseMonthParam } from "../lib/dashboard";

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("no user");

  for (const mk of ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"]) {
    const anchor = parseMonthParam(mk)!;
    const kpi = await getMonthKpis(user.id, anchor);
    console.log(`${mk}: ₹${Math.round(kpi.totalSpend)}  txns=${kpi.transactionCount}  top=${kpi.topCategory}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
