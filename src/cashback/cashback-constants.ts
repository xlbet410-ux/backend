// Below this net loss, cashback isn't worth the BonusWallet overhead.
export const CASHBACK_MIN_LOSS = 500;

// Lenient — most other bonus sources use 2-5x; cashback is a loss-back
// gesture, not a promo, so a light 1x turnover before it's withdrawable.
export const CASHBACK_TURNOVER_MULTIPLIER = 1;
export const CASHBACK_VALIDITY_DAYS = 7;

// How often to check whether yesterday's sweep still needs running. Cheap
// to re-check often — the (userId, calculationDate) unique constraint makes
// every individual grant idempotent, so a redundant tick just no-ops.
export const CASHBACK_SWEEP_CHECK_INTERVAL_MS = 15 * 60 * 1000;
