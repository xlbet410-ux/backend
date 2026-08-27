-- Nullable, no default needed — every existing row simply has no chosen
-- offer, which is correct (they predate the offer engine entirely).
ALTER TABLE "cash_transactions" ADD COLUMN "offer_id" BIGINT;

CREATE INDEX "cash_transactions_offer_id_idx" ON "cash_transactions"("offer_id");

ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
