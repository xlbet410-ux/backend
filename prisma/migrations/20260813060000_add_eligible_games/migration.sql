-- Restrict which games count toward a bonus's turnover requirement.
ALTER TABLE "offers" ADD COLUMN "eligible_games" JSONB NOT NULL DEFAULT '{"mode":"all"}';
ALTER TABLE "bonus_wallets" ADD COLUMN "eligible_games" JSONB;
