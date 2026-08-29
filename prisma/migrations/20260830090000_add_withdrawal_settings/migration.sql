-- Single-row settings table, CRM-controlled: which verification method(s)
-- a withdrawal accepts. Seeded with the one row it will ever have, defaults
-- matching current behavior (both on = either KYC or withdrawal password).
CREATE TABLE "withdrawal_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kyc_enabled" BOOLEAN NOT NULL DEFAULT true,
    "withdraw_password_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "withdrawal_settings" ("id", "kyc_enabled", "withdraw_password_enabled")
VALUES (1, true, true);
