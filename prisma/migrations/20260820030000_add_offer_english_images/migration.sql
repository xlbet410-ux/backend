-- Separate English images for the offer card (image_url) and the homepage
-- popup/banner (banner_url) — existing image_url/banner_url stay exactly
-- as-is and now serve as the Bangla/default image; these are purely
-- additive optional overrides for English.
ALTER TABLE "offers" ADD COLUMN "image_url_en" VARCHAR(500);
ALTER TABLE "offers" ADD COLUMN "banner_url_en" VARCHAR(500);
