-- All additive/defaulted/nullable — safe for existing rows, no data loss.
ALTER TABLE "users" ADD COLUMN "lifetime_deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lifetime_bet_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "vip_upgraded_at" TIMESTAMPTZ;

-- CreateTable: vip_tiers (static 0-50 level config, seeded separately)
CREATE TABLE "vip_tiers" (
    "level" INTEGER NOT NULL,
    "group_name" VARCHAR(30) NOT NULL,
    "name_bn" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "required_deposit" DECIMAL(14,2) NOT NULL,
    "required_bet" DECIMAL(14,2) NOT NULL,
    "bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "turnover_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "bonus_validity_days" INTEGER,
    "referral_signup_bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "referral_bet_commission_pct" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "daily_cashback_pct" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_tiers_pkey" PRIMARY KEY ("level")
);

-- CreateTable: vip_upgrade_logs (one row per level crossed)
CREATE TABLE "vip_upgrade_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "from_level" INTEGER NOT NULL,
    "to_level" INTEGER NOT NULL,
    "lifetime_deposit_at_upgrade" DECIMAL(14,2) NOT NULL,
    "lifetime_bet_at_upgrade" DECIMAL(14,2) NOT NULL,
    "bonus_wallet_id" BIGINT,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "override_by" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_upgrade_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vip_upgrade_logs_bonus_wallet_id_key" ON "vip_upgrade_logs"("bonus_wallet_id");
CREATE INDEX "vip_upgrade_logs_user_id_idx" ON "vip_upgrade_logs"("user_id");
CREATE INDEX "vip_upgrade_logs_created_at_idx" ON "vip_upgrade_logs"("created_at");

ALTER TABLE "vip_upgrade_logs" ADD CONSTRAINT "vip_upgrade_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vip_upgrade_logs" ADD CONSTRAINT "vip_upgrade_logs_to_level_fkey" FOREIGN KEY ("to_level") REFERENCES "vip_tiers"("level") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vip_upgrade_logs" ADD CONSTRAINT "vip_upgrade_logs_bonus_wallet_id_fkey" FOREIGN KEY ("bonus_wallet_id") REFERENCES "bonus_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
