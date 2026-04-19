-- CreateEnum
CREATE TYPE "UpcomingSource" AS ENUM ('PATTERN', 'EMAIL', 'MANUAL');

-- CreateEnum
CREATE TYPE "UpcomingStatus" AS ENUM ('PENDING', 'MATCHED', 'DISMISSED');

-- CreateTable
CREATE TABLE "UpcomingPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "merchantNormalized" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "source" "UpcomingSource" NOT NULL,
    "status" "UpcomingStatus" NOT NULL DEFAULT 'PENDING',
    "matchedTxnId" TEXT,
    "emailMessageId" TEXT,
    "confidence" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpcomingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UpcomingPayment_emailMessageId_key" ON "UpcomingPayment"("emailMessageId");

-- CreateIndex
CREATE INDEX "UpcomingPayment_userId_status_dueDate_idx" ON "UpcomingPayment"("userId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "UpcomingPayment_userId_dueDate_idx" ON "UpcomingPayment"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "UpcomingPayment_userId_merchantNormalized_dueDate_source_key" ON "UpcomingPayment"("userId", "merchantNormalized", "dueDate", "source");

-- AddForeignKey
ALTER TABLE "UpcomingPayment" ADD CONSTRAINT "UpcomingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
