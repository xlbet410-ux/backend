-- Backfill real default rates for the new commission columns onto the
-- already-seeded 51 vip_tiers rows (the schema migration only set them to
-- 0 for every row). Tier2 ~= 50% of that group's existing tier1 rate,
-- tier3 ~= 25% — mirrors the same per-group scaling already used for
-- referral_signup_bonus / referral_bet_commission_pct / daily_cashback_pct.
-- Deposit commission is flat 2.2% across every level, matching the
-- "flat, all levels" reference rate.
UPDATE "vip_tiers" SET
  "referral_bet_commission_pct_tier2" = CASE
    WHEN "level" = 0 THEN 0.0015
    WHEN "level" BETWEEN 1 AND 2 THEN 0.0025
    WHEN "level" BETWEEN 3 AND 5 THEN 0.0040
    WHEN "level" BETWEEN 6 AND 8 THEN 0.0060
    WHEN "level" BETWEEN 9 AND 18 THEN 0.0090
    ELSE 0.0125
  END,
  "referral_bet_commission_pct_tier3" = CASE
    WHEN "level" = 0 THEN 0.0007
    WHEN "level" BETWEEN 1 AND 2 THEN 0.0012
    WHEN "level" BETWEEN 3 AND 5 THEN 0.0020
    WHEN "level" BETWEEN 6 AND 8 THEN 0.0030
    WHEN "level" BETWEEN 9 AND 18 THEN 0.0045
    ELSE 0.0063
  END,
  "referral_deposit_commission_pct" = 0.022;
