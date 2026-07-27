-- AlterTable
ALTER TABLE "users" ADD COLUMN     "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "game_account" VARCHAR(10);

-- CreateTable
CREATE TABLE "game_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "game_uid" VARCHAR(64) NOT NULL,
    "game_round" VARCHAR(64) NOT NULL,
    "serial_number" VARCHAR(64) NOT NULL,
    "bet_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "win_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency_code" VARCHAR(10) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_transactions_serial_number_key" ON "game_transactions"("serial_number");

-- CreateIndex
CREATE INDEX "game_transactions_user_id_idx" ON "game_transactions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_game_account_key" ON "users"("game_account");

-- AddForeignKey
ALTER TABLE "game_transactions" ADD CONSTRAINT "game_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
