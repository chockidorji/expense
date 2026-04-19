import { forUser, prisma } from "./db";
import { TxnType } from "@prisma/client";

const TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istYearMonth(d: Date): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ });
  const [y, m] = fmt.format(d).split("-");
  return { year: Number(y), month: Number(m) };
}

export function parseMonthParam(month: string | undefined): Date | null {
  if (!month) return null;
  const m = month.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) return null;
  return new Date(Date.UTC(year, mon - 1, 1) - IST_OFFSET_MS);
}

function monthBoundsFor(anchor?: Date): { from: Date; to: Date; label: Date; year: number; month: number } {
  const baseUtc = anchor ?? new Date();
  const { year, month } = istYearMonth(baseUtc);
  const month0 = month - 1;
  const from = new Date(Date.UTC(year, month0, 1) - IST_OFFSET_MS);
  const to = new Date(Date.UTC(year, month0 + 1, 1) - IST_OFFSET_MS - 1);
  const label = new Date(Date.UTC(year, month0, 15, 12, 0, 0));
  return { from, to, label, year, month };
}

/** Anchor for the previous IST calendar month. */
function previousMonthAnchor(anchor?: Date): Date {
  const { year, month } = monthBoundsFor(anchor);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return new Date(Date.UTC(prevYear, prevMonth - 1, 15, 12));
}

type Totals = {
  totalSpend: number;
  totalIncome: number;
  transactionCount: number;
  topSpendCategory: string | null;
  topSpendCategoryAmount: number;
  topIncomeSource: string | null;
  topIncomeSourceAmount: number;
};

async function monthTotals(userId: string, from: Date, to: Date): Promise<Totals> {
  const rows = await forUser(userId).transaction.findMany({
    where: { transactionDate: { gte: from, lte: to } },
    select: { amount: true, category: true, type: true, merchant: true },
  });

  const byCatSpend = new Map<string, number>();
  const byMerchantIncome = new Map<string, number>();
  let totalSpend = 0;
  let totalIncome = 0;
  let txnCount = 0;

  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.type === TxnType.DEBIT) {
      totalSpend += amt;
      byCatSpend.set(r.category, (byCatSpend.get(r.category) ?? 0) + amt);
      txnCount++;
    } else if (r.type === TxnType.CREDIT) {
      totalIncome += amt;
      byMerchantIncome.set(r.merchant, (byMerchantIncome.get(r.merchant) ?? 0) + amt);
    }
  }

  const topSpend = Array.from(byCatSpend.entries()).sort((a, b) => b[1] - a[1])[0];
  const topIncome = Array.from(byMerchantIncome.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    totalSpend,
    totalIncome,
    transactionCount: txnCount,
    topSpendCategory: topSpend?.[0] ?? null,
    topSpendCategoryAmount: topSpend?.[1] ?? 0,
    topIncomeSource: topIncome?.[0] ?? null,
    topIncomeSourceAmount: topIncome?.[1] ?? 0,
  };
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // undefined delta when no prior baseline
  return ((current - previous) / previous) * 100;
}

export async function getMonthKpis(userId: string, anchor?: Date) {
  const { from, to, label } = monthBoundsFor(anchor);
  const prevAnchor = previousMonthAnchor(anchor);
  const { from: prevFrom, to: prevTo } = monthBoundsFor(prevAnchor);

  const [now, prev] = await Promise.all([
    monthTotals(userId, from, to),
    monthTotals(userId, prevFrom, prevTo),
  ]);

  const latest = await forUser(userId).transaction.findFirst({
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    select: { amount: true, merchant: true, transactionDate: true },
  });

  return {
    totalSpend: now.totalSpend,
    totalIncome: now.totalIncome,
    netFlow: now.totalIncome - now.totalSpend,
    transactionCount: now.transactionCount,

    topCategory: now.topSpendCategory,
    topCategoryAmount: now.topSpendCategoryAmount,
    topIncomeSource: now.topIncomeSource,
    topIncomeSourceAmount: now.topIncomeSourceAmount,

    latestTxnAmount: latest ? Number(latest.amount) : null,
    latestTxnMerchant: latest?.merchant ?? null,
    latestTxnDate: latest?.transactionDate ?? null,

    // Month-over-month deltas
    spendDelta: pctDelta(now.totalSpend, prev.totalSpend),
    incomeDelta: pctDelta(now.totalIncome, prev.totalIncome),
    netDelta: pctDelta(now.totalIncome - now.totalSpend, prev.totalIncome - prev.totalSpend),
    txnCountDelta: pctDelta(now.transactionCount, prev.transactionCount),
    previousSpend: prev.totalSpend,
    previousIncome: prev.totalIncome,

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

const IST_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});
function istDayKey(d: Date): string { return IST_DAY_FMT.format(d); }

export async function getDailyTrend(userId: string, _unused?: number, anchor?: Date) {
  void _unused;
  const { from, to } = monthBoundsFor(anchor);
  const now = new Date();
  const end = to < now ? to : now;

  const rows = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: end } },
    select: { amount: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });

  const buckets = new Map<string, number>();
  const [fromY, fromM] = istDayKey(from).split("-").map(Number);
  const [endY, endM, endD] = istDayKey(end).split("-").map(Number);
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

/**
 * For the given month, return budget vs actual for every category the user has
 * set a budget on. Ordered by pct used desc (over-budget first).
 */
export async function getBudgetProgress(userId: string, anchor?: Date) {
  const { from, to } = monthBoundsFor(anchor);
  const [budgets, spendRows] = await Promise.all([
    forUser(userId).budget.findMany({}),
    forUser(userId).transaction.groupBy({
      by: ["category"],
      where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);
  const spendByCat = new Map<string, number>();
  for (const r of spendRows as any[]) spendByCat.set(r.category, Number(r._sum?.amount ?? 0));

  const rows = budgets.map(b => {
    const budget = Number(b.amount);
    const spent = spendByCat.get(b.category) ?? 0;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    return { category: b.category, budget, spent, pct, over: spent > budget };
  });
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

/** Distinct IST months that have any transaction activity. Newest first. */
export async function getMonthsWithActivity(userId: string): Promise<{ value: string; label: string }[]> {
  // `transactionDate` is stored as a naive timestamp of the UTC wall-clock. To
  // bucket rows by IST month correctly we must first lift to UTC tstz, then
  // convert to IST. `col AT TIME ZONE 'Asia/Kolkata'` alone would shift -5:30h
  // (treats naive as IST-local), producing the wrong month for rows near
  // midnight IST.
  const rows = await prisma.$queryRaw<{ month: string }[]>`
    SELECT DISTINCT TO_CHAR(
      "transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
      'YYYY-MM'
    ) AS month
    FROM "Transaction"
    WHERE "userId" = ${userId}
    ORDER BY 1 DESC
  `;
  return rows.map(r => {
    const [y, m] = r.month.split("-").map(Number);
    const labelDate = new Date(Date.UTC(y, m - 1, 15, 12, 0, 0));
    const label = labelDate.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    return { value: r.month, label };
  });
}
