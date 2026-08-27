-- Multi-tier + deposit referral commission rates on VipTier.
ALTER TABLE "vip_tiers" ADD COLUMN "referral_bet_commission_pct_tier2" DECIMAL(6,4) NOT NULL DEFAULT 0;
ALTER TABLE "vip_tiers" ADD COLUMN "referral_bet_commission_pct_tier3" DECIMAL(6,4) NOT NULL DEFAULT 0;
ALTER TABLE "vip_tiers" ADD COLUMN "referral_deposit_commission_pct" DECIMAL(6,4) NOT NULL DEFAULT 0;

-- Generalize ReferralCommission to cover bet tier 1-3 and deposit commission,
-- not just tier-1 bet commission.
ALTER TABLE "referral_commissions" ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'bet_tier1';
ALTER TABLE "referral_commissions" ALTER COLUMN "source_game_transaction_id" DROP NOT NULL;
ALTER TABLE "referral_commissions" ADD COLUMN "source_cash_transaction_id" BIGINT;

-- Random-reward-range and daily-claim-window support on Offer.
ALTER TABLE "offers" ADD COLUMN "reward_min" DECIMAL(14,2);
ALTER TABLE "offers" ADD COLUMN "reward_max" DECIMAL(14,2);
ALTER TABLE "offers" ADD COLUMN "claim_window" VARCHAR(20) NOT NULL DEFAULT 'lifetime';
