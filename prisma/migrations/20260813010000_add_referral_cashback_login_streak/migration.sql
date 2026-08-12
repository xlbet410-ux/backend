-- All additive/defaulted/nullable — safe for existing rows, no data loss.
ALTER TABLE "users" ADD COLUMN "lifetime_withdrawn_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "referral_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "lifetime_commission_earned" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "login_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "longest_login_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "last_login_date" DATE;
ALTER TABLE "users" ADD COLUMN "total_logins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: referrals (one row per successfully-linked referral)
CREATE TABLE "referrals" (
    "id" BIGSERIAL NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "referred_id" BIGINT NOT NULL,
    "referral_code" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "signup_bonus_granted_at" TIMESTAMP(3),
    "bonus_wallet_id" BIGINT,
    "signup_ip" VARCHAR(45),
    "fraud_flags" JSONB,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by" VARCHAR(50),
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referred_id_key" ON "referrals"("referred_id");
CREATE UNIQUE INDEX "referrals_bonus_wallet_id_key" ON "referrals"("bonus_wallet_id");
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_bonus_wallet_id_fkey" FOREIGN KEY ("bonus_wallet_id") REFERENCES "bonus_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: referral_commissions (audit log, credited to balance immediately)
CREATE TABLE "referral_commissions" (
    "id" BIGSERIAL NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "referred_id" BIGINT NOT NULL,
    "referral_id" BIGINT NOT NULL,
    "source_game_transaction_id" BIGINT NOT NULL,
    "bet_amount" DECIMAL(14,2) NOT NULL,
    "commission_rate" DECIMAL(6,4) NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "referrer_vip_level_at_event" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "referral_commissions_referrer_id_created_at_idx" ON "referral_commissions"("referrer_id", "created_at");

ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: cashback_grants (one row per user per day; unique constraint = idempotency)
CREATE TABLE "cashback_grants" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "calculation_date" DATE NOT NULL,
    "net_loss" DECIMAL(14,2) NOT NULL,
    "cashback_rate" DECIMAL(6,4) NOT NULL,
    "cashback_amount" DECIMAL(14,2) NOT NULL,
    "vip_level_at_calculation" INTEGER NOT NULL,
    "bonus_wallet_id" BIGINT,
    "total_bet_prev_day" DECIMAL(14,2) NOT NULL,
    "total_win_prev_day" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cashback_grants_user_id_calculation_date_key" ON "cashback_grants"("user_id", "calculation_date");
CREATE UNIQUE INDEX "cashback_grants_bonus_wallet_id_key" ON "cashback_grants"("bonus_wallet_id");
CREATE INDEX "cashback_grants_calculation_date_idx" ON "cashback_grants"("calculation_date");

ALTER TABLE "cashback_grants" ADD CONSTRAINT "cashback_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashback_grants" ADD CONSTRAINT "cashback_grants_bonus_wallet_id_fkey" FOREIGN KEY ("bonus_wallet_id") REFERENCES "bonus_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: login_streak_logs (audit/history only — live value lives on users.login_streak)
CREATE TABLE "login_streak_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "login_date" DATE NOT NULL,
    "streak_day" INTEGER NOT NULL,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_streak_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_streak_logs_user_id_login_date_key" ON "login_streak_logs"("user_id", "login_date");

ALTER TABLE "login_streak_logs" ADD CONSTRAINT "login_streak_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
