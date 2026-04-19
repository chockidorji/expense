import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { listUpcoming, refreshUpcomingForUser } from "@/lib/upcoming-sync";

const Query = z.object({
  horizonDays: z.coerce.number().min(1).max(365).default(30),
  refresh: z.enum(["1", "0"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const q = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
    if (q.refresh === "1") {
      await refreshUpcomingForUser(userId);
    }
    const rows = await listUpcoming(userId, q.horizonDays);
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}

export async function POST() {
  try {
    const { userId } = await requireUser();
    const result = await refreshUpcomingForUser(userId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
