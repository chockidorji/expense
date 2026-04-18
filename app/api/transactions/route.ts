import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { normalizeMerchant, insertOrLog } from "@/lib/dedup";
import { categorize, ALL_CATEGORIES } from "@/lib/categorizer";
import { forUser } from "@/lib/db";
import { TxnSource, TxnType } from "@prisma/client";

const CategoryEnum = z.enum(ALL_CATEGORIES as unknown as [string, ...string[]]);

const CreateSchema = z.object({
  amount: z.number().positive(),
  transactionDate: z.string().datetime(),
  merchant: z.string().min(1).max(200),
  type: z.nativeEnum(TxnType),
  category: CategoryEnum.optional(),
  bankAccount: z.string().optional(),
  referenceNumber: z.string().optional(),
});

const ListQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().optional(),
  source: z.nativeEnum(TxnSource).optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = CreateSchema.parse(await req.json());
    const merchantNormalized = normalizeMerchant(body.merchant);
    const category = body.category ?? await categorize(userId, merchantNormalized);
    const result = await insertOrLog(userId, {
      amount: body.amount,
      transactionDate: new Date(body.transactionDate),
      merchant: body.merchant,
      merchantNormalized,
      category,
      type: body.type,
      source: TxnSource.MANUAL,
      bankAccount: body.bankAccount ?? null,
      referenceNumber: body.referenceNumber ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const q = ListQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where: any = {};
    if (q.from || q.to) where.transactionDate = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) };
    if (q.category) where.category = q.category;
    if (q.source) where.source = q.source;
    if (q.minAmount !== undefined || q.maxAmount !== undefined) where.amount = { ...(q.minAmount !== undefined && { gte: q.minAmount }), ...(q.maxAmount !== undefined && { lte: q.maxAmount }) };
    const rows = await forUser(userId).transaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    return NextResponse.json({
      rows: page.map(r => ({ ...r, amount: r.amount.toString() })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
