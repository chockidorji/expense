import { forUser } from "./db";
import { TxnType } from "@prisma/client";
import { startOfMonth, subDays, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Kolkata";

function monthBoundsIST(now = new Date()): { from: Date; to: Date } {
  const istNow = toZonedTime(now, TZ);
  const monthStartIST = startOfMonth(istNow);
  return { from: fromZonedTime(monthStartIST, TZ), to: now };
}

export async function getMonthKpis(userId: string) {
  const { from, to } = monthBoundsIST();
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
  };
}

export async function getCategoryBreakdown(userId: string) {
  const { from, to } = monthBoundsIST();
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
  const now = new Date();
  const start = fromZonedTime(startOfDay(subDays(toZonedTime(now, TZ), days - 1)), TZ);
  const rows = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: start, lte: now } },
    select: { amount: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = startOfDay(subDays(toZonedTime(now, TZ), days - 1 - i));
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = toZonedTime(r.transactionDate, TZ).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount));
  }
  return Array.from(buckets.entries()).map(([date, amount]) => ({ date, amount }));
}
