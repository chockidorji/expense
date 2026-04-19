import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { UpcomingStatus } from "@prisma/client";

const PatchBody = z.object({
  status: z.nativeEnum(UpcomingStatus).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireUser();
    const body = PatchBody.parse(await req.json());

    // Ensure row belongs to user
    const existing = await prisma.upcomingPayment.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const updated = await prisma.upcomingPayment.update({
      where: { id: params.id },
      data: { ...(body.status && { status: body.status }) },
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireUser();
    const existing = await prisma.upcomingPayment.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.upcomingPayment.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
