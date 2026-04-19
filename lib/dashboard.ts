import { forUser, prisma } from "./db";
import { TxnType } from "@prisma/client";
import { startOfMonth, endOfMonth, subDays, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Kolkata";

/**
 * Find the latest IST month that has ANY transactions for this user. If the
 * user has no transactions yet, falls back to the current IST month. The
 * dashboard's "this month" view follows this — so if you import a Nov/Dec
 * statement in April, you'll see Dec by default, not an empty April.
 */
async function findLatestActivityMonthBounds(userId: string): Promise<{ from: Date; to: Date; label: Date }> {
  // Anchor on the latest DEBIT since the dashboard KPIs / pie are debit-only.
  // A lone CREDIT row (e.g. Jan 1 interest credit) shouldn't flip the default
  // month to one that has zero actual spending.
  const latestDebit = await prisma.transaction.findFirst({
    where: { userId, type: TxnType.DEBIT },
    orderBy: { transactionDate: "desc" },
    select: { transactionDate: true },
  });
  const latestAny = latestDebit ?? await prisma.transaction.findFirst({
    where: { userId },
    orderBy: { transactionDate: "desc" },
    select: { transactionDate: true },
  });

  const anchor = latestAny?.transactionDate ?? new Date();
  const istAnchor = toZonedTime(anchor, TZ);
  const monthStartIst = startOfMonth(istAnchor);
  const monthEndIst = endOfMonth(istAnchor);
  return {
    from: fromZonedTime(monthStartIst, TZ),
    to: fromZonedTime(monthEndIst, TZ),
    label: monthStartIst,
  };
}

export async function getMonthKpis(userId: string) {
  const { from, to, label } = await findLatestActivityMonthBounds(userId);
  const debits = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    select: { amount: true, category: true },
  });
  const total = debits.reduce((sum, r) => sum + Number(r.amount), 0);
  const byCat = new Map<string, number>();
  for (const r of debits) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount));
  const topCat = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0];
  return {
    totalSpend: total,
    topCategory: topCat?.[0] ?? null,
    topCategoryAmount: topCat?.[1] ?? 0,
    transactionCount: debits.length,
    monthLabel: label.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: TZ }),
  };
}

export async function getCategoryBreakdown(userId: string) {
  const { from, to } = await findLatestActivityMonthBounds(userId);
  const rows = await forUser(userId).transaction.groupBy({
    by: ["category"],
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return rows
    .map((r: any) => ({ category: r.category, amount: Number(r._sum?.amount ?? 0) }))
    .sort((a: any, b: any) => b.amount - a.amount);
}

export async function getDailyTrend(userId: string, days = 30) {
  // Anchor the 30-day window on the latest DEBIT so imported historical
  // statements don't produce a flat chart (trend is debit-only).
  const latestDebit = await prisma.transaction.findFirst({
    where: { userId, type: TxnType.DEBIT },
    orderBy: { transactionDate: "desc" },
    select: { transactionDate: true },
  });
  const anchor = latestDebit?.transactionDate ?? new Date();
  const start = fromZonedTime(startOfDay(subDays(toZonedTime(anchor, TZ), days - 1)), TZ);
  const rows = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: start, lte: anchor } },
    select: { amount: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = startOfDay(subDays(toZonedTime(anchor, TZ), days - 1 - i));
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = toZonedTime(r.transactionDate, TZ).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount));
  }
  return Array.from(buckets.entries()).map(([date, amount]) => ({ date, amount }));
}
