-- Agent-referral system: agents can now refer players directly (parallel to
-- the existing player-to-player Referral system), with deposit/withdraw
-- payment-account routing and, for 'commission'-type agents, automatic
-- loss-based commission. See schema.prisma comments on Agent/User/
-- AgentCommission for the full design.

ALTER TABLE "agents" ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'personal';
ALTER TABLE "agents" ADD COLUMN "referral_code" VARCHAR(20);
CREATE UNIQUE INDEX "agents_referral_code_key" ON "agents"("referral_code");

ALTER TABLE "users" ADD COLUMN "referred_by_agent_id" BIGINT;
CREATE INDEX "users_referred_by_agent_id_idx" ON "users"("referred_by_agent_id");
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_agent_id_fkey"
  FOREIGN KEY ("referred_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "agent_commissions" (
  "id" BIGSERIAL PRIMARY KEY,
  "agent_id" BIGINT NOT NULL,
  "player_id" BIGINT NOT NULL,
  "source_game_transaction_id" BIGINT NOT NULL,
  "loss_amount" DECIMAL(14,2) NOT NULL,
  "commission_rate" DECIMAL(5,2) NOT NULL,
  "commission_amount" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "agent_commissions_source_game_transaction_id_key" ON "agent_commissions"("source_game_transaction_id");
CREATE INDEX "agent_commissions_agent_id_idx" ON "agent_commissions"("agent_id");
CREATE INDEX "agent_commissions_player_id_idx" ON "agent_commissions"("player_id");
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_player_id_fkey"
  FOREIGN KEY ("player_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
