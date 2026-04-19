import { forUser, prisma } from "./db";
import { TxnType } from "@prisma/client";
import { startOfMonth, endOfMonth, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Kolkata";

/** "2026-04" → an IST Date pointing at midnight on the 1st of that month. */
export function parseMonthParam(month: string | undefined): Date | null {
  if (!month) return null;
  const m = month.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) return null;
  // Build "1st of month midnight IST" then convert to UTC instant.
  return fromZonedTime(new Date(year, mon - 1, 1, 0, 0, 0, 0), TZ);
}

/** Month bounds for a given anchor (UTC instant). Defaults to "current month in IST". */
function monthBoundsFor(anchor?: Date): { from: Date; to: Date; label: Date } {
  const baseUtc = anchor ?? new Date();
  const istAnchor = toZonedTime(baseUtc, TZ);
  const monthStartIst = startOfMonth(istAnchor);
  const monthEndIst = endOfMonth(istAnchor);
  return {
    from: fromZonedTime(monthStartIst, TZ),
    to: fromZonedTime(monthEndIst, TZ),
    label: monthStartIst,
  };
}

export async function getMonthKpis(userId: string, anchor?: Date) {
  const { from, to, label } = monthBoundsFor(anchor);
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

export async function getCategoryBreakdown(userId: string, anchor?: Date) {
  const { from, to } = monthBoundsFor(anchor);
  const rows = await forUser(userId).transaction.groupBy({
    by: ["category"],
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return rows
    .map((r: any) => ({ category: r.category, amount: Number(r._sum?.amount ?? 0) }))
    .sort((a: any, b: any) => b.amount - a.amount);
}

/**
 * Daily debit trend scoped to the anchor month (1st → last day). If anchor is
 * the current month, it ends at today — future days aren't rendered.
 * The chart's x-axis length therefore matches the month's length (28/30/31).
 */
export async function getDailyTrend(userId: string, _unused?: number, anchor?: Date) {
  void _unused; // preserved in the signature for backwards compatibility
  const { from, to } = monthBoundsFor(anchor);
  const now = new Date();
  const end = to < now ? to : now;

  const rows = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: end } },
    select: { amount: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });

  const buckets = new Map<string, number>();
  // Pre-seed one bucket per IST day from the 1st through `end` inclusive.
  const istStart = toZonedTime(from, TZ);
  const istEnd = toZonedTime(end, TZ);
  for (
    let d = startOfDay(istStart);
    d.getTime() <= startOfDay(istEnd).getTime();
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = toZonedTime(r.transactionDate, TZ).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount));
  }
  return Array.from(buckets.entries()).map(([date, amount]) => ({ date, amount }));
}

/** Distinct months that have at least one debit. Returns newest first. */
export async function getMonthsWithActivity(userId: string): Promise<{ value: string; label: string }[]> {
  const rows = await prisma.$queryRaw<{ month: Date }[]>`
    SELECT DATE_TRUNC('month', "transactionDate" AT TIME ZONE 'Asia/Kolkata')::date AS month
    FROM "Transaction"
    WHERE "userId" = ${userId} AND "type" = 'DEBIT'
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  return rows.map(r => {
    const d = new Date(r.month);
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    return { value, label };
  });
}
