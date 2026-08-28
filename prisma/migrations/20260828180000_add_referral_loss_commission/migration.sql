-- CreateTable: referral_loss_commissions (monthly counterpart to
-- referral_commissions — pays a % of the referred player's net PRINCIPAL
-- loss for a completed calendar month, instead of a % of raw bet stake per
-- bet. See ReferralService.runMonthlyLossCommissionSweep.
CREATE TABLE "referral_loss_commissions" (
    "id" BIGSERIAL NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "referred_id" BIGINT NOT NULL,
    "source_bettor_id" BIGINT NOT NULL,
    "referral_id" BIGINT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "calculation_month" DATE NOT NULL,
    "net_principal_loss" DECIMAL(14,2) NOT NULL,
    "commission_rate" DECIMAL(6,4) NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "referrer_vip_level_at_event" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_loss_commissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "referral_loss_commissions_referrer_id_calculation_month_idx" ON "referral_loss_commissions"("referrer_id", "calculation_month");
CREATE UNIQUE INDEX "referral_loss_commissions_referrer_id_source_bettor_id_ty_key" ON "referral_loss_commissions"("referrer_id", "source_bettor_id", "type", "calculation_month");

ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_source_bettor_id_fkey" FOREIGN KEY ("source_bettor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
