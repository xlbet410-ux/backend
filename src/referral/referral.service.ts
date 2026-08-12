import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VipService } from '../vip/vip.service';
import { OffersService } from '../offers/offers.service';
import { NotificationService } from '../notification/notification.service';
import { Prisma } from '../../generated/prisma/client';
import {
  REFERRAL_MILESTONE_LEVEL,
  FRAUD_SAME_IP_WINDOW_MS,
  FRAUD_RAPID_VELOCITY_WINDOW_MS,
  FRAUD_RAPID_VELOCITY_THRESHOLD,
} from './referral-constants';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vipService: VipService,
    private readonly offersService: OffersService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Resolves the code a new user entered at signup against a real
   * referrer's ownReferralCode and creates the tracking row. Called from
   * AuthService.register() right after the user row is created — the raw
   * code itself is already stored on User.referralCode regardless of
   * whether it resolves to anything, so this only adds the actual link.
   * Never throws — a broken referral link must not block registration.
   */
  async linkReferral(
    newUserId: bigint,
    enteredCode: string | null | undefined,
    signupIp: string | null,
  ): Promise<void> {
    const trimmed = enteredCode?.trim().toUpperCase();
    if (!trimmed) return;

    try {
      const referrer = await this.prisma.user.findUnique({
        where: { ownReferralCode: trimmed },
      });
      if (!referrer) return; // Invalid/unknown code — silently ignored, same as today.
      if (referrer.id === newUserId) return; // Defensive; shouldn't be reachable pre-creation.
      if (!referrer.referralEnabled) return;

      const fraudFlags = await this.detectFraud(referrer.id, signupIp);

      await this.prisma.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: newUserId,
          referralCode: trimmed,
          status: fraudFlags.length > 0 ? 'fraud_flagged' : 'pending',
          signupIp: signupIp ?? undefined,
          fraudFlags: fraudFlags.length > 0 ? fraudFlags : undefined,
        },
      });

      this.logger.log(
        `Referral linked: ${referrer.id} -> ${newUserId}${fraudFlags.length ? ` (flags: ${fraudFlags.join(',')})` : ''}`,
      );
    } catch (err) {
      this.logger.error(
        `Referral link failed for user ${newUserId}: ${(err as Error).message}`,
      );
    }
  }

  private async detectFraud(
    referrerId: bigint,
    signupIp: string | null,
  ): Promise<string[]> {
    const flags: string[] = [];

    if (signupIp) {
      const sameIpCount = await this.prisma.referral.count({
        where: {
          referrerId,
          signupIp,
          createdAt: { gte: new Date(Date.now() - FRAUD_SAME_IP_WINDOW_MS) },
        },
      });
      if (sameIpCount > 0) flags.push('same_ip_24h');
    }

    const rapidCount = await this.prisma.referral.count({
      where: {
        referrerId,
        createdAt: {
          gte: new Date(Date.now() - FRAUD_RAPID_VELOCITY_WINDOW_MS),
        },
      },
    });
    if (rapidCount >= FRAUD_RAPID_VELOCITY_THRESHOLD) flags.push('rapid_velocity');

    return flags;
  }

  /**
   * Called after VipService.recordDeposit/recordBet — deliberately not
   * called from inside VipService itself, which would make VipModule and
   * ReferralModule import each other (ReferralService also needs
   * VipService.getTierRow for commission/signup-bonus amounts). Instead
   * this re-checks the referred user's *current* level itself; cheap and
   * already idempotent via the status==='pending' gate below, so calling it
   * after every deposit/bet — not just ones that actually leveled someone
   * up — is fine.
   */
  async checkReferralMilestone(referredUserId: bigint): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: referredUserId },
    });
    if (!referral || referral.status !== 'pending') return;

    const referredUser = await this.prisma.user.findUnique({
      where: { id: referredUserId },
    });
    if (!referredUser || referredUser.vipLevel < REFERRAL_MILESTONE_LEVEL) return;

    const referrer = await this.prisma.user.findUnique({
      where: { id: referral.referrerId },
    });
    if (!referrer) return;

    const tier = await this.vipService.getTierRow(referrer.vipLevel);
    const signupBonus = tier?.referralSignupBonus ?? new Prisma.Decimal(0);

    if (signupBonus.greaterThan(0) && tier) {
      const turnoverRequired = signupBonus.mul(tier.turnoverMultiplier);
      const expiresAt = tier.bonusValidityDays
        ? new Date(Date.now() + tier.bonusValidityDays * 86_400_000)
        : null;

      await this.prisma.$transaction(async (tx) => {
        const bw = await tx.bonusWallet.create({
          data: {
            userId: referrer.id,
            type: 'referral_signup_bonus',
            amount: signupBonus,
            turnoverRequired,
            expiresAt,
            metadata: {
              referredUserId: referredUserId.toString(),
              referralId: referral.id.toString(),
            },
          },
        });
        await tx.referral.update({
          where: { id: referral.id },
          data: {
            status: 'milestone_met',
            signupBonusGrantedAt: new Date(),
            bonusWalletId: bw.id,
          },
        });
      });
    } else {
      // No signup bonus configured for the referrer's current tier — still
      // mark the milestone met so it's not reprocessed, and so a manually
      // configured referral_milestone offer can still fire below.
      await this.prisma.referral.update({
        where: { id: referral.id },
        data: { status: 'milestone_met', signupBonusGrantedAt: new Date() },
      });
    }

    this.logger.log(
      `Referral milestone met: ${referral.referrerId} <- ${referredUserId}`,
    );

    if (signupBonus.greaterThan(0)) {
      await this.notificationService.create(referrer.id, 'referral_signup_bonus', {
        amount: signupBonus.toString(),
        referredName: referredUser.fullName,
      });
    }

    // Best-effort: an admin-configured referral_milestone offer can stack
    // extra reward on top — "tier" here is the referrer's total successful-
    // referral count so far, letting admins configure e.g. "on your 5th
    // successful referral, +৳500" via the existing offers system.
    try {
      const successfulCount = await this.prisma.referral.count({
        where: { referrerId: referrer.id, status: 'milestone_met' },
      });
      await this.offersService.processTrigger({
        type: 'referral_milestone',
        userId: referrer.id,
        tier: successfulCount,
      });
    } catch (err) {
      this.logger.error(
        `referral_milestone offer trigger failed for ${referrer.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Called after a real-money bet settles. Commission is real, immediately
   * withdrawable money (no turnover — per the product decision, it's not a
   * BonusWallet), so it's credited straight to the referrer's balance in
   * the same transaction that logs it. Never throws — callers wrap this the
   * same way VipService.recordBet is wrapped.
   */
  async recordBetCommission(
    bettorUserId: bigint,
    betAmount: Prisma.Decimal,
    gameTransactionId: bigint,
  ): Promise<void> {
    if (betAmount.lessThanOrEqualTo(0)) return;

    const referral = await this.prisma.referral.findUnique({
      where: { referredId: bettorUserId },
    });
    if (!referral || referral.status === 'fraud_flagged') return;

    const referrer = await this.prisma.user.findUnique({
      where: { id: referral.referrerId },
    });
    if (!referrer || !referrer.referralEnabled) return;

    const tier = await this.vipService.getTierRow(referrer.vipLevel);
    if (!tier || tier.referralBetCommissionPct.lessThanOrEqualTo(0)) return;

    // referralBetCommissionPct is stored as a fraction (0.005 = 0.5%), not
    // a whole percentage — same convention as VipTier's other pct fields.
    const commissionAmount = betAmount.mul(tier.referralBetCommissionPct);
    if (commissionAmount.lessThanOrEqualTo(0)) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: referrer.id },
        data: {
          balance: { increment: commissionAmount },
          lifetimeCommissionEarned: { increment: commissionAmount },
        },
      });
      await tx.referralCommission.create({
        data: {
          referrerId: referrer.id,
          referredId: bettorUserId,
          referralId: referral.id,
          sourceGameTransactionId: gameTransactionId,
          betAmount,
          commissionRate: tier.referralBetCommissionPct,
          commissionAmount,
          referrerVipLevelAtEvent: referrer.vipLevel,
        },
      });
    });
  }

  async getReferralStats(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const tier = await this.vipService.getTierRow(user.vipLevel);

    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { referred: { select: { fullName: true, memberId: true, createdAt: true } } },
    });

    const counts = { total: referrals.length, pending: 0, milestoneMet: 0, fraudFlagged: 0 };
    for (const r of referrals) {
      if (r.status === 'pending') counts.pending++;
      else if (r.status === 'milestone_met') counts.milestoneMet++;
      else if (r.status === 'fraud_flagged') counts.fraudFlagged++;
    }

    const recentCommissions = await this.prisma.referralCommission.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      referralCode: user.ownReferralCode,
      referralEnabled: user.referralEnabled,
      counts,
      currentTierPerks: {
        vipLevel: user.vipLevel,
        referralSignupBonus: tier?.referralSignupBonus.toString() ?? '0',
        referralBetCommissionPct: tier?.referralBetCommissionPct.toString() ?? '0',
      },
      lifetimeCommissionEarned: user.lifetimeCommissionEarned.toString(),
      referrals: referrals.map((r) => ({
        id: r.id.toString(),
        referredName: r.referred.fullName,
        referredMemberId: r.referred.memberId,
        status: r.status,
        joinedAt: r.referred.createdAt.toISOString(),
        milestoneMetAt: r.signupBonusGrantedAt?.toISOString() ?? null,
      })),
      recentCommissions: recentCommissions.map((c) => ({
        id: c.id.toString(),
        amount: c.commissionAmount.toString(),
        betAmount: c.betAmount.toString(),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  // --- Admin (CRM) ---

  async adminListReferrals(params: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 30, 100);
    const where = params.status ? { status: params.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          referrer: { select: { fullName: true, memberId: true, phoneNumber: true } },
          referred: { select: { fullName: true, memberId: true, phoneNumber: true } },
        },
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      total,
      referrals: rows.map((r) => ({
        id: r.id.toString(),
        referrerName: r.referrer.fullName,
        referrerMemberId: r.referrer.memberId,
        referredName: r.referred.fullName,
        referredMemberId: r.referred.memberId,
        status: r.status,
        fraudFlags: (r.fraudFlags as string[] | null) ?? [],
        signupIp: r.signupIp,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedBy: r.reviewedBy,
        reviewNotes: r.reviewNotes,
      })),
    };
  }

  async adminReviewReferral(
    id: bigint,
    decision: 'approve' | 'reject',
    reviewedBy: string,
    notes?: string,
  ) {
    const referral = await this.prisma.referral.findUniqueOrThrow({ where: { id } });

    await this.prisma.referral.update({
      where: { id },
      data: {
        // Approving un-flags back to 'pending' so the normal milestone
        // check can grant the bonus the next time it runs; rejecting keeps
        // it permanently fraud_flagged (excluded from commission/milestone).
        status: decision === 'approve' ? 'pending' : 'fraud_flagged',
        reviewedAt: new Date(),
        reviewedBy,
        reviewNotes: notes,
      },
    });

    if (decision === 'approve') {
      // The referred user may have already crossed the milestone level
      // while this was flagged — check now so the bonus isn't stuck.
      await this.checkReferralMilestone(referral.referredId);
    }

    return { success: true };
  }

  async adminGetCommissions(referrerId?: bigint, page = 1, pageSize = 30) {
    const where = referrerId ? { referrerId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.referralCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * Math.min(pageSize, 100),
        take: Math.min(pageSize, 100),
        include: {
          referrer: { select: { fullName: true, memberId: true } },
          referred: { select: { fullName: true, memberId: true } },
        },
      }),
      this.prisma.referralCommission.count({ where }),
    ]);
    return {
      total,
      commissions: rows.map((c) => ({
        id: c.id.toString(),
        referrerName: c.referrer.fullName,
        referrerMemberId: c.referrer.memberId,
        referredName: c.referred.fullName,
        referredMemberId: c.referred.memberId,
        betAmount: c.betAmount.toString(),
        commissionRate: c.commissionRate.toString(),
        commissionAmount: c.commissionAmount.toString(),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
