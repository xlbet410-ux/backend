-- Distinguishes "player explicitly declined every promotion on this
-- deposit" from "no offerId was set" (which previously also covered "no
-- offers were ever shown"), so fireDepositTriggers can honor an explicit
-- opt-out instead of auto-matching some other eligible offer anyway.

ALTER TABLE "cash_transactions" ADD COLUMN "no_offer" BOOLEAN NOT NULL DEFAULT false;
