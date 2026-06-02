-- Add referenceNumber to the Transaction dedup unique key. Allows two
-- distinct bank transactions that share amount+date+merchant (but differ
-- in refNo) to both land. Same email re-fetch is still caught upstream
-- by Transaction.gmailMessageId UNIQUE.
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_userId_amount_transactionDate_merchantNormalize_key";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_amount_transactionDate_merchantNormalize_key" UNIQUE ("userId", amount, "transactionDate", "merchantNormalized", "referenceNumber");
