-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "users" ADD COLUMN "member_id" VARCHAR(20);

-- Backfill existing users deterministically from their own row id, so
-- there's no collision risk against each other or against the random
-- codes AuthService.generateMemberId() will hand out to new signups.
UPDATE "users" SET "member_id" = '2XL-' || lpad("id"::text, 6, '0') WHERE "member_id" IS NULL;

ALTER TABLE "users" ALTER COLUMN "member_id" SET NOT NULL;

CREATE UNIQUE INDEX "users_member_id_key" ON "users"("member_id");
