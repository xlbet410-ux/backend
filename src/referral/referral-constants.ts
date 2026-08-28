// The signup-bonus milestone piggybacks on the existing VIP auto-upgrade
// event instead of tracking its own deposit/bet thresholds — "referred
// friend became a real player" = reached this VIP level. Keeping this as a
// named constant (not inlined) makes the intent obvious if it's ever tuned.
export const REFERRAL_MILESTONE_LEVEL = 1;

// Anti-fraud thresholds — IP-only (no client-side device fingerprinting,
// which the bet app doesn't have instrumentation for yet).
export const FRAUD_SAME_IP_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FRAUD_RAPID_VELOCITY_WINDOW_MS = 60 * 60 * 1000;
export const FRAUD_RAPID_VELOCITY_THRESHOLD = 10;

// How often to check whether last month's loss-commission sweep still
// needs running. A month-boundary event only actually changes once a
// month, so this doesn't need cashback's 15-minute cadence — the
// (referrerId, sourceBettorId, type, calculationMonth) unique constraint
// makes every individual payout idempotent regardless, so a redundant tick
// just no-ops cheaply.
export const REFERRAL_LOSS_COMMISSION_SWEEP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
