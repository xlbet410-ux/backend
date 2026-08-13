-- DB-enforced double-payment guards for referral commission — a retried or
-- concurrent call for the same source bet/deposit hits this constraint
-- instead of creating a second commission row. NULLs never collide in
-- Postgres, so each constraint only actually applies to the row type that
-- sets that column (bet_tier* rows have source_cash_transaction_id = null
-- and vice versa) — a single bet can still have up to 3 rows (one per tier).
CREATE UNIQUE INDEX "referral_commissions_source_game_transaction_id_type_key"
  ON "referral_commissions" ("source_game_transaction_id", "type");
CREATE UNIQUE INDEX "referral_commissions_source_cash_transaction_id_type_key"
  ON "referral_commissions" ("source_cash_transaction_id", "type");
