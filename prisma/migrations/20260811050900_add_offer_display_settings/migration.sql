-- All defaulted/nullable — safe for existing rows. show_in_promotions_page
-- defaults to true so every existing offer keeps appearing on /promotions
-- exactly as it did before this column existed.
ALTER TABLE "offers" ADD COLUMN "show_in_promotions_page" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "offers" ADD COLUMN "show_in_popup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offers" ADD COLUMN "popup_priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offers" ADD COLUMN "popup_cta_text_bn" VARCHAR(50);
ALTER TABLE "offers" ADD COLUMN "popup_cta_text_en" VARCHAR(50);
ALTER TABLE "offers" ADD COLUMN "popup_cta_link" VARCHAR(255);
