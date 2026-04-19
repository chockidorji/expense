import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { normalizeMerchant } from "@/lib/dedup";
import { UpcomingSource, UpcomingStatus, Prisma } from "@prisma/client";

const CreateBody = z.object({
  merchant: z.string().min(1).max(200),
  amount: z.number().positive(),
  // Accept "YYYY-MM-DD" (local date) or any ISO datetime.
  dueDate: z.string(),
  category: z.string().optional(),
  note: z.string().max(200).optional(),
});

function parseDueDate(raw: string): Date {
  // Date-only input → treat as 00:00 UTC so it lines up with pattern-detector
  // due-date normalization.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(raw);
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = CreateBody.parse(await req.json());
    const dueDate = parseDueDate(body.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: "invalid dueDate" }, { status: 400 });
    }
    const merchantNormalized = normalizeMerchant(body.merchant);
    try {
      const row = await prisma.upcomingPayment.create({
        data: {
          userId,
          merchant: body.merchant,
          merchantNormalized,
          amount: new Prisma.Decimal(body.amount),
          dueDate,
          category: body.category ?? null,
          source: UpcomingSource.MANUAL,
          status: UpcomingStatus.PENDING,
          note: body.note ?? null,
        },
      });
      return NextResponse.json({ id: row.id });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: "An upcoming entry for that merchant + date already exists." }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
