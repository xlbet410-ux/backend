-- Separate withdrawal password, independent of the account login password —
-- lets a player who hasn't completed KYC yet still withdraw by setting and
-- confirming this instead. Nullable: unset until the player opts in.
ALTER TABLE "users" ADD COLUMN "withdraw_password_hash" VARCHAR(255);
