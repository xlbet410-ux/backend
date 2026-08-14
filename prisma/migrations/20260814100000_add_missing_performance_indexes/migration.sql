-- Missing indexes identified by a security/performance audit — cash_transactions
-- had no composite indexes covering its actual query patterns (player history,
-- admin cash-in/cash-out queues, deposit-count checks), game_transactions only
-- had a single-column user_id index (no createdAt for the paginated/sorted
-- history query), and messages had no index at all on conversation_id.
CREATE INDEX "cash_transactions_user_id_created_at_idx" ON "cash_transactions"("user_id", "created_at");
CREATE INDEX "cash_transactions_type_created_at_idx" ON "cash_transactions"("type", "created_at");
CREATE INDEX "cash_transactions_user_id_type_status_idx" ON "cash_transactions"("user_id", "type", "status");

CREATE INDEX "game_transactions_user_id_created_at_idx" ON "game_transactions"("user_id", "created_at");

CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
