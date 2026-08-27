-- Separate launch username for the 9Wicket provider, which requires exactly
-- 6 characters (incompatible with the existing 10-char game_account column).
ALTER TABLE "users" ADD COLUMN "nine_wicket_account" VARCHAR(6);

CREATE UNIQUE INDEX "users_nine_wicket_account_key" ON "users"("nine_wicket_account");
