import { forUser } from "./db";
import { CATEGORY_KEYWORDS } from "./categorizer";
import { TxnType } from "@prisma/client";

/**
 * Collapses a `merchantNormalized` string to a stable "brand key" that stays
 * the same across months even when UPI reference numbers or POS transaction
 * IDs change. First tries to match a known-brand keyword from CATEGORY_KEYWORDS
 * (so e.g. all Hostinger rows collapse to "hostinger"); falls back to the raw
 * normalized string, which is still stable for clean POS / NEFT merchants.
 */
export function brandKey(merchantNormalized: string): { key: string; category: string | null } {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (merchantNormalized.includes(kw)) return { key: kw, category: cat };
    }
  }
  return { key: merchantNormalized, category: null };
}

export type Prediction = {
  brandKey: string;
  merchant: string;
  merchantNormalized: string;
  amount: number;
  dueDate: Date;
  category: string | null;
  confidence: number;
  intervalDays: number;
  occurrences: number;
};

/**
 * Infer the next expected charge for each brand the user has paid ≥ 2 times in
 * the last 6 months on a roughly-regular cadence. Returns only predictions
 * whose due date lands in [today, today + horizonDays].
 */
export async function detectRecurringPredictions(userId: string, horizonDays = 60): Promise<Prediction[]> {
  const since = new Date(Date.now() - 180 * 86400e3);
  const rows = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: since } },
    select: { amount: true, merchant: true, merchantNormalized: true, transactionDate: true, category: true },
    orderBy: { transactionDate: "asc" },
  });

  type Row = (typeof rows)[number];
  const groups = new Map<string, Row[]>();
  const groupCategory = new Map<string, string | null>();
  for (const r of rows) {
    const { key, category } = brandKey(r.merchantNormalized);
    if (!groups.has(key)) {
      groups.set(key, []);
      groupCategory.set(key, category);
    }
    groups.get(key)!.push(r);
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86400e3);
  const predictions: Prediction[] = [];

  for (const [key, txns] of Array.from(groups.entries())) {
    if (txns.length < 2) continue;

    // Skip brands whose category is clearly one-off in nature
    const cat = groupCategory.get(key) ?? txns[txns.length - 1].category;
    if (cat === "personal" || cat === "uncategorized" || cat === "shopping" || cat === "food" || cat === "groceries" || cat === "transport" || cat === "health" || cat === "travel") {
      // Allow only if cadence is very regular (rent-like). Otherwise skip to avoid
      // noisy predictions from grocery runs or food delivery patterns.
      // Deferred check — we'll still need to compute interval below before deciding.
    }

    const intervals: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      const days = (txns[i].transactionDate.getTime() - txns[i - 1].transactionDate.getTime()) / 86400e3;
      if (days > 0) intervals.push(days);
    }
    if (intervals.length === 0) continue;

    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // Only weekly to ~45-day cadence
    if (median < 5 || median > 45) continue;

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdev = Math.sqrt(intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length);
    const cv = mean > 0 ? stdev / mean : 0;

    // Drop noisy categories unless the cadence is very tight (rent-like)
    const noisyCats = new Set(["personal", "shopping", "food", "groceries", "transport", "health", "travel", "entertainment"]);
    if (cat && noisyCats.has(cat) && cv > 0.15) continue;

    // Predict next due date from last payment + median interval
    const last = txns[txns.length - 1];
    const nextDue = new Date(last.transactionDate.getTime() + median * 86400e3);
    if (nextDue.getTime() < now.getTime() - 86400e3) continue; // skip far-past
    if (nextDue > horizon) continue;

    // Confidence: baseline 40, up to 30 from low CV, up to 25 from count
    const confidence = Math.round(
      Math.max(30, Math.min(95, 40 + (1 - Math.min(cv, 1)) * 30 + Math.min(txns.length * 4, 25)))
    );

    // Predict amount: last observed (most representative of current pricing)
    const amount = Number(last.amount);

    predictions.push({
      brandKey: key,
      merchant: last.merchant,
      merchantNormalized: last.merchantNormalized,
      amount,
      dueDate: nextDue,
      category: cat,
      confidence,
      intervalDays: Math.round(median),
      occurrences: txns.length,
    });
  }

  return predictions.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
