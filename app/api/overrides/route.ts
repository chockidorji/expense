import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const rows = await forUser(userId).categoryOverride.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
