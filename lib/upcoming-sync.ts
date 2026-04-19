import { forUser, prisma } from "./db";
import { detectRecurringPredictions } from "./upcoming-pattern";
import { UpcomingSource, UpcomingStatus, Prisma } from "@prisma/client";

/**
 * Runs both detectors (pattern + email TBD) and upserts results into the
 * UpcomingPayment table. Safe to call repeatedly — unique constraint on
 * (userId, merchantNormalized, dueDate, source) makes each run idempotent,
 * and PENDING rows whose due dates moved are updated in place.
 */
export async function refreshUpcomingForUser(userId: string): Promise<{
  inserted: number;
  updated: number;
  matched: number;
  expired: number;
}> {
  let inserted = 0;
  let updated = 0;

  const predictions = await detectRecurringPredictions(userId);

  for (const p of predictions) {
    // Normalize dueDate to start-of-IST-day so the unique key is stable across
    // re-runs on the same day.
    const dueIst = new Date(Date.UTC(p.dueDate.getUTCFullYear(), p.dueDate.getUTCMonth(), p.dueDate.getUTCDate(), 0, 0, 0));
    const where = {
      dedup_key: {
        userId,
        merchantNormalized: p.merchantNormalized,
        dueDate: dueIst,
        source: UpcomingSource.PATTERN,
      },
    };
    const data = {
      merchant: p.merchant,
      amount: new Prisma.Decimal(p.amount),
      category: p.category,
      confidence: p.confidence,
      note: `Seen ${p.occurrences}× every ~${p.intervalDays}d`,
    };
    try {
      const existing = await prisma.upcomingPayment.findUnique({ where });
      if (existing) {
        await prisma.upcomingPayment.update({
          where: { id: existing.id },
          data: { ...data, status: existing.status === UpcomingStatus.DISMISSED ? existing.status : UpcomingStatus.PENDING },
        });
        updated++;
      } else {
        await prisma.upcomingPayment.create({
          data: {
            userId,
            merchantNormalized: p.merchantNormalized,
            dueDate: dueIst,
            source: UpcomingSource.PATTERN,
            status: UpcomingStatus.PENDING,
            ...data,
          },
        });
        inserted++;
      }
    } catch (e) {
      // Swallow duplicate-key races; next run will reconcile.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }

  const matched = await matchPendingAgainstTransactions(userId);
  const expired = await expireStaleUpcoming(userId);

  return { inserted, updated, matched, expired };
}

/**
 * Look for PENDING upcoming payments that have a real Transaction within the
 * matching window (±7 days of due date, same brand, amount within ±15%).
 * Flip matched rows to MATCHED and link via matchedTxnId.
 */
async function matchPendingAgainstTransactions(userId: string): Promise<number> {
  const pending = await prisma.upcomingPayment.findMany({
    where: { userId, status: UpcomingStatus.PENDING },
  });
  let matched = 0;
  for (const up of pending) {
    const lowBound = new Date(up.dueDate.getTime() - 7 * 86400e3);
    const highBound = new Date(up.dueDate.getTime() + 7 * 86400e3);
    // Fuzzy amount window
    const amtNum = Number(up.amount);
    const minAmt = new Prisma.Decimal(amtNum * 0.85);
    const maxAmt = new Prisma.Decimal(amtNum * 1.15);
    // Try exact merchantNormalized first; if none, try brand-substring.
    const exact = await prisma.transaction.findFirst({
      where: {
        userId,
        merchantNormalized: up.merchantNormalized,
        transactionDate: { gte: lowBound, lte: highBound },
        amount: { gte: minAmt, lte: maxAmt },
      },
      select: { id: true },
    });
    const hit =
      exact ??
      (await prisma.transaction.findFirst({
        where: {
          userId,
          merchantNormalized: { contains: up.merchantNormalized.split(" ")[0] },
          transactionDate: { gte: lowBound, lte: highBound },
          amount: { gte: minAmt, lte: maxAmt },
        },
        select: { id: true },
      }));
    if (hit) {
      await prisma.upcomingPayment.update({
        where: { id: up.id },
        data: { status: UpcomingStatus.MATCHED, matchedTxnId: hit.id },
      });
      matched++;
    }
  }
  return matched;
}

/** Remove PENDING rows whose due date is >14 days in the past (never matched). */
async function expireStaleUpcoming(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 86400e3);
  const res = await prisma.upcomingPayment.deleteMany({
    where: { userId, status: UpcomingStatus.PENDING, dueDate: { lt: cutoff } },
  });
  return res.count;
}

/** Helper wrapper used by routes. */
export async function listUpcoming(userId: string, horizonDays = 30) {
  void forUser; // keep import marker for future scoped queries
  const horizonEnd = new Date(Date.now() + horizonDays * 86400e3);
  const rows = await prisma.upcomingPayment.findMany({
    where: {
      userId,
      status: UpcomingStatus.PENDING,
      dueDate: { lte: horizonEnd },
    },
    orderBy: { dueDate: "asc" },
  });
  return rows.map(r => ({
    id: r.id,
    merchant: r.merchant,
    amount: Number(r.amount),
    dueDate: r.dueDate.toISOString(),
    category: r.category,
    source: r.source,
    status: r.status,
    confidence: r.confidence,
    note: r.note,
  }));
}
