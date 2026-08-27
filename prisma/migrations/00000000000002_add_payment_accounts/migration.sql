-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" BIGSERIAL NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(150) NOT NULL,
    "account_name" VARCHAR(100),
    "details" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- Grant the new CRM page to the same pages/roles setup as every other
-- existing page (there's no automated seed for this — pages/role_pages
-- rows have always been inserted by hand alongside their migration).
INSERT INTO "pages" ("path", "label", "section")
VALUES ('/dashboard/payment-accounts', 'Payment Account', 'Menu')
ON CONFLICT ("path") DO NOTHING;

INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", '/dashboard/payment-accounts' FROM "roles" WHERE "name" = 'Admin' AND "is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
