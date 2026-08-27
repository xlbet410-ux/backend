-- AlterTable
ALTER TABLE "cash_transactions" ADD COLUMN "payment_account_id" BIGINT;

CREATE INDEX "cash_transactions_payment_account_id_idx" ON "cash_transactions"("payment_account_id");

ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
