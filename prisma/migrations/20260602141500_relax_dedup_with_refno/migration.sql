-- Prisma uses a unique INDEX (not a constraint) for @@unique. Drop the
-- index, recreate it including referenceNumber so two distinct bank
-- transactions that share amount+date+merchant (but differ in refNo)
-- can both land. Same email re-fetched is still caught upstream by
-- Transaction.gmailMessageId UNIQUE.
DROP INDEX IF EXISTS "Transaction_userId_amount_transactionDate_merchantNormalize_key";

CREATE UNIQUE INDEX "Transaction_userId_amount_transactionDate_merchantNormalize_key"
  ON "Transaction" ("userId", amount, "transactionDate", "merchantNormalized", "referenceNumber");
