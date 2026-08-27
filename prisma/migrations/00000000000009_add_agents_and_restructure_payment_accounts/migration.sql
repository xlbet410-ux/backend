-- CreateTable: agents (the agent's own login/profile)
CREATE TABLE "agents" (
    "id" BIGSERIAL NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(255),
    "commission" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "account_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthly_earn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthly_collect" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agents_phone_number_key" ON "agents"("phone_number");

-- AlterTable: payment_accounts now belongs to an agent, and the
-- profile-level fields (password/commission/limit/earn/collect) move to
-- the new agents table above. The table is empty in every environment
-- this migration has run in, so no backfill is needed.
ALTER TABLE "payment_accounts" DROP COLUMN "password_hash";
ALTER TABLE "payment_accounts" DROP COLUMN "commission";
ALTER TABLE "payment_accounts" DROP COLUMN "account_limit";
ALTER TABLE "payment_accounts" DROP COLUMN "monthly_earn";
ALTER TABLE "payment_accounts" DROP COLUMN "monthly_collect";
ALTER TABLE "payment_accounts" ADD COLUMN "agent_id" BIGINT NOT NULL;

CREATE INDEX "payment_accounts_agent_id_idx" ON "payment_accounts"("agent_id");

ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: cash_transactions can now be approved by either a staff
-- Account (reviewed_by, existing) or an Agent (approved_by_agent_id, new).
ALTER TABLE "cash_transactions" ADD COLUMN "approved_by_agent_id" BIGINT;

CREATE INDEX "cash_transactions_approved_by_agent_id_idx" ON "cash_transactions"("approved_by_agent_id");

ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_approved_by_agent_id_fkey" FOREIGN KEY ("approved_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
