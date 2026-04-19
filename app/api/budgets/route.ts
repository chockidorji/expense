import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";
import { ALL_CATEGORIES } from "@/lib/categorizer";

const CategoryEnum = z.enum(ALL_CATEGORIES as unknown as [string, ...string[]]);

const UpsertSchema = z.object({
  category: CategoryEnum,
  amount: z.number().nonnegative(),
});

export async function GET() {
  try {
    const { userId } = await requireUser();
    const rows = await forUser(userId).budget.findMany({ orderBy: { category: "asc" } });
    return NextResponse.json({
      rows: rows.map(r => ({
        id: r.id,
        category: r.category,
        amount: r.amount.toString(),
        updatedAt: r.updatedAt,
      })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = UpsertSchema.parse(await req.json());
    // amount === 0 means "delete the budget".
    if (body.amount === 0) {
      await forUser(userId).budget.delete({ where: { category: body.category } }).catch(() => {});
      return NextResponse.json({ ok: true, deleted: true });
    }
    const saved = await forUser(userId).budget.upsert({
      where: { category: body.category },
      create: { category: body.category, amount: body.amount },
      update: { amount: body.amount },
    });
    return NextResponse.json({
      id: saved.id,
      category: saved.category,
      amount: saved.amount.toString(),
      updatedAt: saved.updatedAt,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
