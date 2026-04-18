import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function DELETE(_req: NextRequest, ctx: { params: { merchant: string } }) {
  try {
    const { userId } = await requireUser();
    await forUser(userId).categoryOverride.delete({ where: { merchantNormalized: decodeURIComponent(ctx.params.merchant) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
