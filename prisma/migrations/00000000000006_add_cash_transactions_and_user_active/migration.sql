-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_transactions_user_id_idx" ON "cash_transactions"("user_id");

ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
