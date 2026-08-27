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
