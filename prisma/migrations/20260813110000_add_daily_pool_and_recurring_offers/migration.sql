-- Daily-resetting budget/claim caps, weighted reward distribution, and
-- self-recurring scheduling for Offer rows (Red Envelope Rain's daily pool,
-- Members Day's monthly recurrence) — see schema.prisma comments on Offer.
ALTER TABLE "offers" ADD COLUMN "daily_budget_cap" DECIMAL(14,2);
ALTER TABLE "offers" ADD COLUMN "daily_claim_cap" INTEGER;
ALTER TABLE "offers" ADD COLUMN "reward_distribution" JSONB;
ALTER TABLE "offers" ADD COLUMN "recurring_month_days" JSONB;
