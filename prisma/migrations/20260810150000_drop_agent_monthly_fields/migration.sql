-- Monthly earn/collect were manual, admin-entered numbers on the agent
-- profile. They're replaced by figures computed on the fly from real
-- cash-in/cash-out CashTransaction rows (via payment_accounts.agent_id),
-- so the stored columns are no longer used anywhere and are dropped here.
-- Safe regardless of existing data: dropping a column never fails on
-- existing rows the way adding a NOT NULL one can.
ALTER TABLE "agents" DROP COLUMN IF EXISTS "monthly_earn";
ALTER TABLE "agents" DROP COLUMN IF EXISTS "monthly_collect";
