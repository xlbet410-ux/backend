-- Tracks the platform's share alongside each agent commission settlement,
-- as a real persisted (agent-editable, at request time) figure rather than
-- a derived-on-the-fly number, so a partial settlement's shortfall can
-- carry forward as a "due" balance on the agent's next request. Nullable —
-- existing rows predate this column and have no value to backfill.
ALTER TABLE "agent_settlements" ADD COLUMN "platform_amount" DECIMAL(14,2);
