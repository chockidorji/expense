import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";
import { TxnType } from "@prisma/client";

const Query = z.object({
  category: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const q = Query.parse(Object.fromEntries(req.nextUrl.searchParams));

    const rows = await forUser(userId).transaction.groupBy({
      by: ["merchant"],
      where: {
        category: q.category,
        type: TxnType.DEBIT,
        transactionDate: { gte: new Date(q.from), lte: new Date(q.to) },
      },
      _sum: { amount: true },
      _count: { _all: true },
      _min: { transactionDate: true },
      _max: { transactionDate: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merchants = (rows as any[])
      .map((r) => ({
        merchant: r.merchant as string,
        amount: Number(r._sum?.amount ?? 0),
        count: (r._count?._all ?? 0) as number,
        firstDate: r._min?.transactionDate
          ? (r._min.transactionDate instanceof Date ? r._min.transactionDate.toISOString() : String(r._min.transactionDate))
          : null,
        lastDate: r._max?.transactionDate
          ? (r._max.transactionDate instanceof Date ? r._max.transactionDate.toISOString() : String(r._max.transactionDate))
          : null,
      }))
      .sort((a, b) => b.amount - a.amount);

    const total = merchants.reduce((s, m) => s + m.amount, 0);

    return NextResponse.json({ category: q.category, total, merchants });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
