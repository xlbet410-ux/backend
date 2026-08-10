-- Lets an admin create a staff Account without setting a password up
-- front (matches the Agent model). Relaxing a NOT NULL constraint never
-- fails regardless of existing data, unlike adding one.
ALTER TABLE "accounts" ALTER COLUMN "password_hash" DROP NOT NULL;
