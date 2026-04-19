import { forUser, prisma } from "./db";
import { TxnType } from "@prisma/client";

const TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** For a UTC instant, what IST year/month (1-12) is it in? */
function istYearMonth(d: Date): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: TZ,
  });
  const [y, m] = fmt.format(d).split("-");
  return { year: Number(y), month: Number(m) };
}

/** "2026-04" → UTC instant at the first millisecond of April 1st IST. */
export function parseMonthParam(month: string | undefined): Date | null {
  if (!month) return null;
  const m = month.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) return null;
  return new Date(Date.UTC(year, mon - 1, 1) - IST_OFFSET_MS);
}

/**
 * Month bounds in UTC that exactly cover an IST calendar month. Defaults to
 * the current IST month. Computes bounds via explicit IST-offset math rather
 * than date-fns-tz round-tripping, because toZonedTime + startOfMonth drifts
 * by 5h30m when the server runs outside IST.
 */
function monthBoundsFor(anchor?: Date): { from: Date; to: Date; label: Date } {
  const baseUtc = anchor ?? new Date();
  const { year, month } = istYearMonth(baseUtc);
  const month0 = month - 1;

  const from = new Date(Date.UTC(year, month0, 1) - IST_OFFSET_MS);
  const to = new Date(Date.UTC(year, month0 + 1, 1) - IST_OFFSET_MS - 1);
  // Mid-month UTC noon — used purely for .toLocaleDateString() label formatting.
  const label = new Date(Date.UTC(year, month0, 15, 12, 0, 0));
  return { from, to, label };
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

/** Format a UTC Date as its IST calendar day, "YYYY-MM-DD". */
const IST_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});
function istDayKey(d: Date): string {
  return IST_DAY_FMT.format(d);
}

/**
 * Daily debit trend scoped to the anchor month (1st → last day). If anchor is
 * the current month, it ends at today — future days aren't rendered. The
 * chart's x-axis length therefore matches the month's length (28/30/31).
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
  // Derive the month's IST year/month from `from`, then generate keys 1..lastDay.
  const [fromY, fromM] = istDayKey(from).split("-").map(Number); // YYYY, MM, DD
  const endKey = istDayKey(end);
  const [endY, endM, endD] = endKey.split("-").map(Number);
  const lastDayOfMonth = new Date(Date.UTC(fromY, fromM, 0)).getUTCDate();
  const endDay = (endY === fromY && endM === fromM) ? endD : lastDayOfMonth;
  for (let day = 1; day <= endDay; day++) {
    const key = `${fromY}-${String(fromM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    buckets.set(key, 0);
  }

  for (const r of rows) {
    const key = istDayKey(r.transactionDate);
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
