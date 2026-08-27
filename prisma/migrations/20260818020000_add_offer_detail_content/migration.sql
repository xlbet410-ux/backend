-- Rich Detail-popup content for the player-facing offer cards: steps and a
-- label/value bonus table, each stored as simple line-delimited text and
-- parsed client-side (see bet app's OfferDetailModal). Null on any existing
-- offer falls back to the previous description/reward heuristic.
ALTER TABLE "offers" ADD COLUMN "steps_to_claim_bn" TEXT;
ALTER TABLE "offers" ADD COLUMN "steps_to_claim_en" TEXT;
ALTER TABLE "offers" ADD COLUMN "bonus_info_bn" TEXT;
ALTER TABLE "offers" ADD COLUMN "bonus_info_en" TEXT;
