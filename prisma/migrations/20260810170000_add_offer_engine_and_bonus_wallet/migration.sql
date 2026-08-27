-- AlterTable: plain admin-settable tiers for offer targeting — both get a
-- default so this is safe regardless of existing user rows.
ALTER TABLE "users" ADD COLUMN "vip_level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "agent_tier" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: offers (admin-configured bonus definitions)
CREATE TABLE "offers" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title_bn" VARCHAR(200) NOT NULL,
    "title_en" VARCHAR(200),
    "description_bn" TEXT,
    "description_en" TEXT,
    "image_url" VARCHAR(500),
    "banner_url" VARCHAR(500),
    "terms_bn" TEXT,
    "terms_en" TEXT,
    "category" VARCHAR(30) NOT NULL,
    "trigger_type" VARCHAR(50) NOT NULL,
    "trigger_config" JSONB,
    "min_deposit" DECIMAL(14,2),
    "max_deposit" DECIMAL(14,2),
    "required_vip_level" INTEGER,
    "required_agent_tier" INTEGER,
    "requires_kyc" BOOLEAN NOT NULL DEFAULT false,
    "is_new_users_only" BOOLEAN NOT NULL DEFAULT false,
    "max_claims_per_user" INTEGER NOT NULL DEFAULT 1,
    "reward_type" VARCHAR(30) NOT NULL,
    "reward_amount" DECIMAL(14,2),
    "reward_cap" DECIMAL(14,2),
    "turnover_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "turnover_base" VARCHAR(20) NOT NULL DEFAULT 'bonus',
    "bonus_validity_days" INTEGER DEFAULT 30,
    "total_budget" DECIMAL(14,2),
    "total_claimed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "claim_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offers_slug_key" ON "offers"("slug");
CREATE INDEX "offers_is_active_category_idx" ON "offers"("is_active", "category");
CREATE INDEX "offers_is_active_trigger_type_idx" ON "offers"("is_active", "trigger_type");
CREATE INDEX "offers_starts_at_ends_at_idx" ON "offers"("starts_at", "ends_at");

-- CreateTable: offer_claims (one row per successful award)
CREATE TABLE "offer_claims" (
    "id" BIGSERIAL NOT NULL,
    "offer_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "bonus_wallet_id" BIGINT,
    "trigger_amount" DECIMAL(14,2),
    "reward_amount" DECIMAL(14,2) NOT NULL,
    "metadata" JSONB,
    "claimed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offer_claims_bonus_wallet_id_key" ON "offer_claims"("bonus_wallet_id");
CREATE INDEX "offer_claims_offer_id_user_id_idx" ON "offer_claims"("offer_id", "user_id");
CREATE INDEX "offer_claims_user_id_claimed_at_idx" ON "offer_claims"("user_id", "claimed_at");

-- CreateTable: bonus_wallets (pending/resolved bonus credits)
CREATE TABLE "bonus_wallets" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "turnover_required" DECIMAL(14,2) NOT NULL,
    "turnover_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ,
    "claimed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "metadata" JSONB,

    CONSTRAINT "bonus_wallets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bonus_wallets_user_id_status_claimed_at_idx" ON "bonus_wallets"("user_id", "status", "claimed_at");
CREATE INDEX "bonus_wallets_status_expires_at_idx" ON "bonus_wallets"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "offer_claims" ADD CONSTRAINT "offer_claims_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_claims" ADD CONSTRAINT "offer_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_claims" ADD CONSTRAINT "offer_claims_bonus_wallet_id_fkey" FOREIGN KEY ("bonus_wallet_id") REFERENCES "bonus_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bonus_wallets" ADD CONSTRAINT "bonus_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
