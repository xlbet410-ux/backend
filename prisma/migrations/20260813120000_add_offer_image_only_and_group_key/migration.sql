-- Image-only display mode and cross-offer grouping (see schema.prisma
-- comments on Offer.imageOnly / Offer.groupKey).
ALTER TABLE "offers" ADD COLUMN "image_only" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offers" ADD COLUMN "group_key" VARCHAR(100);
