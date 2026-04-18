import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Limited Prisma surface scoped to a user. Apply userId filter at source.
 * Use instead of raw `prisma.*` in route handlers.
 */
export function forUser(userId: string) {
  return {
    transaction: {
      findMany: (args?: Omit<Prisma.TransactionFindManyArgs, "where"> & { where?: Prisma.TransactionWhereInput }) =>
        prisma.transaction.findMany({ ...args, where: { ...(args?.where ?? {}), userId } }),
      findFirst: (args?: Omit<Prisma.TransactionFindFirstArgs, "where"> & { where?: Prisma.TransactionWhereInput }) =>
        prisma.transaction.findFirst({ ...args, where: { ...(args?.where ?? {}), userId } }),
      count: (args?: Omit<Prisma.TransactionCountArgs, "where"> & { where?: Prisma.TransactionWhereInput }) =>
        prisma.transaction.count({ ...args, where: { ...(args?.where ?? {}), userId } }),
      create: (data: Omit<Prisma.TransactionUncheckedCreateInput, "userId">) =>
        prisma.transaction.create({ data: { ...data, userId } }),
      update: (args: { where: { id: string }; data: Prisma.TransactionUpdateInput }) =>
        prisma.transaction.update({ where: { id: args.where.id, userId } as any, data: args.data }),
      delete: (args: { where: { id: string } }) =>
        prisma.transaction.delete({ where: { id: args.where.id, userId } as any }),
      groupBy: (args: Prisma.TransactionGroupByArgs) =>
        prisma.transaction.groupBy({ ...args, where: { ...(args.where ?? {}), userId } } as any),
    },
    categoryOverride: {
      findMany: (args?: Omit<Prisma.CategoryOverrideFindManyArgs, "where"> & { where?: Prisma.CategoryOverrideWhereInput }) =>
        prisma.categoryOverride.findMany({ ...args, where: { ...(args?.where ?? {}), userId } }),
      upsert: (args: { where: { merchantNormalized: string }; create: Omit<Prisma.CategoryOverrideUncheckedCreateInput, "userId">; update: Prisma.CategoryOverrideUpdateInput }) =>
        prisma.categoryOverride.upsert({
          where: { userId_merchantNormalized: { userId, merchantNormalized: args.where.merchantNormalized } },
          create: { ...args.create, userId },
          update: args.update,
        }),
      delete: (args: { where: { merchantNormalized: string } }) =>
        prisma.categoryOverride.delete({
          where: { userId_merchantNormalized: { userId, merchantNormalized: args.where.merchantNormalized } },
        }),
    },
    dedupLog: {
      create: (data: Omit<Prisma.DedupLogUncheckedCreateInput, "userId">) =>
        prisma.dedupLog.create({ data: { ...data, userId } }),
    },
  };
}
