-- Agent commission wallet: request/confirm settlement flow, mirroring
-- cash_transactions' status/reviewed_by/reviewed_at shape. Not a real money
-- movement — agents are still paid outside the app; this just records that
-- staff confirmed a payout, so AgentsService.getWalletSummary can subtract
-- it from what's still owed.
CREATE TABLE "agent_settlements" (
    "id" BIGSERIAL NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "note" VARCHAR(500),
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by" BIGINT,
    "confirmed_at" TIMESTAMPTZ,

    CONSTRAINT "agent_settlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_settlements_agent_id_status_idx" ON "agent_settlements"("agent_id", "status");

ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
