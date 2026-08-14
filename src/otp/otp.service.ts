import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type OtpEntry = { code: string; expiresAt: number; attempts: number };
type VerifiedEntry = { expiresAt: number };

// Time to enter the 6-digit code after it's texted.
const OTP_TTL_MS = 5 * 60 * 1000;
// Once verified, how long the rest of the KYC flow (doc upload, selfie)
// has to finish before phone verification needs to happen again — see
// KycService.submit, which checks wasRecentlyVerified at the final step.
const VERIFIED_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
// Caps brute-forcing a single sent code — the route-level @Throttle on
// /otp/verify limits request rate, but a code is only ~4-8 digits, so a
// per-code attempt cap matters too: past this many wrong guesses the
// pending code is invalidated outright, forcing a fresh /otp/send.
const MAX_VERIFY_ATTEMPTS = 5;

const OSMS_BASE_URL_DEFAULT = 'https://api.o-sms.com/api/service';

/**
 * Wraps the O-SMS "Generate & Send OTP" endpoint. That endpoint has no
 * server-side verification of its own — it hands back the code it just
 * texted and expects the caller to store and check it — so this service is
 * the actual OTP store: in-memory, keyed by userId (not phone number, since
 * the KYC flow lets a player re-type/change the phone mid-flow; what
 * actually matters is "this account holder proved control of some phone
 * number just now"), same TTL-map-plus-sweep pattern already used for chat
 * and balance SSE tickets.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pending = new Map<string, OtpEntry>();
  private readonly lastSentAt = new Map<string, number>();
  private readonly verified = new Map<string, VerifiedEntry>();

  constructor(private readonly config: ConfigService) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
    for (const [k, v] of this.verified) if (v.expiresAt < now) this.verified.delete(k);
  }

  async sendOtp(userId: string, phoneNumber: string): Promise<void> {
    const last = this.lastSentAt.get(userId);
    if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
      throw new BadRequestException(
        'Please wait a moment before requesting another code.',
      );
    }

    const baseUrl =
      this.config.get<string>('OSMS_BASE_URL') ?? OSMS_BASE_URL_DEFAULT;
    const apiKey = this.config.get<string>('OSMS_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'SMS provider is not configured (missing OSMS_API_KEY).',
      );
    }

    let data: { success?: boolean; otp?: string; message?: string } | null =
      null;
    try {
      const res = await fetch(`${baseUrl}/send-otp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber }),
      });
      data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || typeof data.otp !== 'string') {
        throw new Error(data?.message ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `OTP send failed for ${phoneNumber}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        "Couldn't send the verification code. Please check the number and try again.",
      );
    }

    this.pending.set(userId, {
      code: data.otp as string,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });
    this.lastSentAt.set(userId, Date.now());
  }

  verifyOtp(userId: string, code: string): boolean {
    const entry = this.pending.get(userId);
    if (!entry || entry.expiresAt < Date.now()) return false;

    if (entry.code !== code.trim()) {
      entry.attempts += 1;
      if (entry.attempts >= MAX_VERIFY_ATTEMPTS) this.pending.delete(userId);
      return false;
    }

    this.pending.delete(userId);
    this.verified.set(userId, { expiresAt: Date.now() + VERIFIED_TTL_MS });
    return true;
  }

  /** Gates the final KYC submit step — see KycService.submit. */
  wasRecentlyVerified(userId: string): boolean {
    const entry = this.verified.get(userId);
    return !!entry && entry.expiresAt >= Date.now();
  }
}
