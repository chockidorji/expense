import { Prisma } from "@prisma/client";
import { forUser } from "./db";

export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type InsertOutcome =
  | { status: "inserted"; id: string }
  | { status: "duplicate"; reason: string };

export async function insertOrLog(
  userId: string,
  data: Omit<Prisma.TransactionUncheckedCreateInput, "userId">,
): Promise<InsertOutcome> {
  const scoped = forUser(userId);
  try {
    const created = await scoped.transaction.create(data);
    return { status: "inserted", id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const reason = Array.isArray(e.meta?.target) ? (e.meta!.target as string[]).join(",") : "unique_violation";
      await scoped.dedupLog.create({ attemptedData: data as any, reason });
      return { status: "duplicate", reason };
    }
    throw e;
  }
}
