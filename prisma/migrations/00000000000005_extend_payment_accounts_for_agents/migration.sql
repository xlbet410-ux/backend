-- Extends payment_accounts to double as the CRM's "Agent" record: an agent
-- login (optional password), commission rate, processing limit, and
-- manually-tracked monthly earn/collect figures. There's no real
-- transaction ledger to compute earn/collect from yet, so those two are
-- plain admin-entered numbers, not derived.
ALTER TABLE "payment_accounts"
  ADD COLUMN "password_hash" VARCHAR(255),
  ADD COLUMN "commission" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "account_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "monthly_earn" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "monthly_collect" DECIMAL(14,2) NOT NULL DEFAULT 0;
