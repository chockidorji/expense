import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";

const PatchSchema = z.object({ category: z.string().min(1).max(50) });

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { userId } = await requireUser();
    const body = PatchSchema.parse(await req.json());
    const updated = await forUser(userId).transaction.update({
      where: { id: ctx.params.id },
      data: { category: body.category },
    });
    // Override upsert lands in Step 7; for now just update the row.
    return NextResponse.json({ id: updated.id, category: updated.category });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { userId } = await requireUser();
    await forUser(userId).transaction.delete({ where: { id: ctx.params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
