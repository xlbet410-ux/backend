import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VipService } from '../vip/vip.service';
import { OffersService } from '../offers/offers.service';
import { NotificationService } from '../notification/notification.service';
import { BalanceService } from '../balance/balance.service';
import { Prisma } from '../../generated/prisma/client';
import { startOfUTCMonth } from '../common/date.util';
import { computeMonthlyPrincipalLoss } from '../common/principal-loss.util';
import {
  REFERRAL_MILESTONE_LEVEL,
  FRAUD_SAME_IP_WINDOW_MS,
  FRAUD_RAPID_VELOCITY_WINDOW_MS,
  FRAUD_RAPID_VELOCITY_THRESHOLD,
  REFERRAL_LOSS_COMMISSION_SWEEP_CHECK_INTERVAL_MS,
} from './referral-constants';

@Injectable()
export class ReferralService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReferralService.name);
  private lossCommissionSweepTimer: ReturnType<typeof setInterval> | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vipService: VipService,
    private readonly offersService: OffersService,
    private readonly notificationService: NotificationService,
    private readonly balanceService: BalanceService,
  ) {}

  onModuleInit(): void {
    void this.runMonthlyLossCommissionSweep();
    this.lossCommissionSweepTimer = setInterval(() => {
      void this.runMonthlyLossCommissionSweep();
    }, REFERRAL_LOSS_COMMISSION_SWEEP_CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.lossCommissionSweepTimer) clearInterval(this.lossCommissionSweepTimer);
  }

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
        // Credited to real balance immediately — the turnover requirement
        // above still gates withdrawal (see BonusService.canWithdraw), it
        // no longer gates whether the player can see/use the money.
        await tx.user.update({
          where: { id: referrer.id },
          data: { balance: { increment: signupBonus } },
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
      this.balanceService.notifyChanged(referrer.id);
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
   * Called after a real-money bet settles. Pays up to 3 levels of upline:
   * the direct (tier-1) referrer, then THEIR referrer (tier-2), then
   * THEIRS (tier-3) — each at the rate of their OWN VIP tier, same
   * convention as tier-1 already used. Commission is real, immediately
   * withdrawable money (no turnover — per the product decision, it's not a
   * BonusWallet), so it's credited straight to each referrer's balance in
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

    const tierRates: Record<
      'bet_tier1' | 'bet_tier2' | 'bet_tier3',
      (tier: NonNullable<Awaited<ReturnType<VipService['getTierRow']>>>) => Prisma.Decimal
    > = {
      bet_tier1: (tier) => tier.referralBetCommissionPct,
      bet_tier2: (tier) => tier.referralBetCommissionPctTier2,
      bet_tier3: (tier) => tier.referralBetCommissionPctTier3,
    };

    let referredId = bettorUserId;
    let upline: { id: bigint; referralId: bigint } | null = {
      id: referral.referrerId,
      referralId: referral.id,
    };

    for (const type of ['bet_tier1', 'bet_tier2', 'bet_tier3'] as const) {
      if (!upline) break;
      const currentReferralId = upline.referralId;
      const referrer = await this.prisma.user.findUnique({
        where: { id: upline.id },
      });
      // Defensive: a malformed/looped chain must never pay the same person
      // twice for one bet.
      if (!referrer || !referrer.referralEnabled || referrer.id === referredId) break;

      const tier = await this.vipService.getTierRow(referrer.vipLevel);
      const rate = tier ? tierRates[type](tier) : new Prisma.Decimal(0);
      if (tier && rate.greaterThan(0)) {
        const commissionAmount = betAmount.mul(rate);
        if (commissionAmount.greaterThan(0)) {
          try {
            await this.prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: referrer.id },
                data: {
                  balance: { increment: commissionAmount },
                  lifetimeCommissionEarned: { increment: commissionAmount },
                },
              });
              // If this exact (gameTransactionId, type) pair was already
              // paid — a retried/concurrent call — this throws P2002 and
              // rolls back the balance increment above too (same
              // transaction), instead of paying twice.
              await tx.referralCommission.create({
                data: {
                  referrerId: referrer.id,
                  referredId,
                  referralId: currentReferralId,
                  type,
                  sourceGameTransactionId: gameTransactionId,
                  betAmount,
                  commissionRate: rate,
                  commissionAmount,
                  referrerVipLevelAtEvent: referrer.vipLevel,
                },
              });
            });
            this.balanceService.notifyChanged(referrer.id);
          } catch (err) {
            if (
              !(
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002'
              )
            ) {
              throw err;
            }
            this.logger.log(
              `${type} commission for game transaction ${gameTransactionId} already recorded — skipped duplicate.`,
            );
          }
        }
      }

      // Walk up one more level: is THIS referrer themselves someone's
      // referred user?
      referredId = referrer.id;
      const nextReferral = await this.prisma.referral.findUnique({
        where: { referredId: referrer.id },
      });
      upline =
        nextReferral && nextReferral.status !== 'fraud_flagged'
          ? { id: nextReferral.referrerId, referralId: nextReferral.id }
          : null;
    }
  }

  /**
   * Called on every approved deposit (not just the first) — a recurring
   * commission to the direct referrer only (no multi-tier upline for
   * deposits, matching the reference spec). Same real-money, no-turnover
   * pattern as recordBetCommission. Never throws.
   */
  async recordDepositCommission(
    depositorUserId: bigint,
    depositAmount: Prisma.Decimal,
    cashTransactionId: bigint,
  ): Promise<void> {
    if (depositAmount.lessThanOrEqualTo(0)) return;

    const referral = await this.prisma.referral.findUnique({
      where: { referredId: depositorUserId },
    });
    if (!referral || referral.status === 'fraud_flagged') return;

    const referrer = await this.prisma.user.findUnique({
      where: { id: referral.referrerId },
    });
    if (!referrer || !referrer.referralEnabled) return;

    const tier = await this.vipService.getTierRow(referrer.vipLevel);
    if (!tier || tier.referralDepositCommissionPct.lessThanOrEqualTo(0)) return;

    const commissionAmount = depositAmount.mul(tier.referralDepositCommissionPct);
    if (commissionAmount.lessThanOrEqualTo(0)) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: referrer.id },
          data: {
            balance: { increment: commissionAmount },
            lifetimeCommissionEarned: { increment: commissionAmount },
          },
        });
        // If this cash transaction already has a 'deposit' commission row
        // — a retried/concurrent call — this throws P2002 and rolls back
        // the balance increment above too (same transaction), instead of
        // paying twice.
        await tx.referralCommission.create({
          data: {
            referrerId: referrer.id,
            referredId: depositorUserId,
            referralId: referral.id,
            type: 'deposit',
            sourceCashTransactionId: cashTransactionId,
            betAmount: depositAmount,
            commissionRate: tier.referralDepositCommissionPct,
            commissionAmount,
            referrerVipLevelAtEvent: referrer.vipLevel,
          },
        });
      });
      this.balanceService.notifyChanged(referrer.id);
    } catch (err) {
      if (
        !(
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        )
      ) {
        throw err;
      }
      this.logger.log(
        `Deposit commission for cash transaction ${cashTransactionId} already recorded — skipped duplicate.`,
      );
    }
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
        referralBetCommissionPctTier2: tier?.referralBetCommissionPctTier2.toString() ?? '0',
        referralBetCommissionPctTier3: tier?.referralBetCommissionPctTier3.toString() ?? '0',
        referralDepositCommissionPct: tier?.referralDepositCommissionPct.toString() ?? '0',
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
        type: c.type,
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
        type: c.type,
        betAmount: c.betAmount.toString(),
        commissionRate: c.commissionRate.toString(),
        commissionAmount: c.commissionAmount.toString(),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Grants last calendar month's loss commission to every referred player's
   * upline. Idempotent per (referrer, originating bettor, tier, month) —
   * see ReferralLossCommission's unique constraint — safe to call
   * repeatedly, which is exactly what the periodic timer above does
   * instead of a real once-a-month cron (no @nestjs/schedule dependency in
   * this codebase, same reasoning as CashbackService's daily sweep).
   */
  async runMonthlyLossCommissionSweep(): Promise<{ processed: number }> {
    const thisMonthStart = startOfUTCMonth(new Date());
    const lastMonthStart = new Date(
      Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - 1, 1),
    );
    let processed = 0;

    try {
      // Only bettors who actually played last month are worth walking the
      // referral chain for — same "groupBy first, then per-user" shape as
      // CashbackService.runDailySweep.
      const rows = await this.prisma.gameTransaction.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } },
      });

      for (const row of rows) {
        try {
          const granted = await this.grantMonthlyLossCommission(
            row.userId,
            lastMonthStart,
          );
          if (granted) processed++;
        } catch (err) {
          this.logger.error(
            `Monthly loss commission failed for bettor ${row.userId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Monthly loss commission sweep query failed: ${(err as Error).message}`,
      );
      return { processed: 0 };
    }

    if (processed > 0) {
      this.logger.log(
        `Monthly loss commission sweep: paid upline for ${processed} bettor(s) for ${lastMonthStart.toISOString().slice(0, 7)}`,
      );
    }
    return { processed };
  }

  /**
   * Pays `bettorUserId`'s referral upline (up to 3 tiers) a % of their net
   * PRINCIPAL loss for `calculationMonth` — same upline-chain-walk shape
   * and the same tier1/2/3 VIP-level rates as recordBetCommission, but
   * computed once for the whole month from net loss instead of per-bet
   * from raw stake. The SAME netPrincipalLoss figure is reused unchanged
   * at every tier (mirrors recordBetCommission reusing the same betAmount
   * at every tier, rather than each intermediate referrer's own result).
   */
  private async grantMonthlyLossCommission(
    bettorUserId: bigint,
    calculationMonth: Date,
  ): Promise<boolean> {
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: bettorUserId },
    });
    if (!referral || referral.status === 'fraud_flagged') return false;

    const netPrincipalLoss = await computeMonthlyPrincipalLoss(
      this.prisma,
      bettorUserId,
      calculationMonth,
    );
    if (netPrincipalLoss.lessThanOrEqualTo(0)) return false;

    const tierRates: Record<
      'loss_tier1' | 'loss_tier2' | 'loss_tier3',
      (tier: NonNullable<Awaited<ReturnType<VipService['getTierRow']>>>) => Prisma.Decimal
    > = {
      loss_tier1: (tier) => tier.referralBetCommissionPct,
      loss_tier2: (tier) => tier.referralBetCommissionPctTier2,
      loss_tier3: (tier) => tier.referralBetCommissionPctTier3,
    };

    let referredId = bettorUserId;
    let upline: { id: bigint; referralId: bigint } | null = {
      id: referral.referrerId,
      referralId: referral.id,
    };
    let anyGranted = false;

    for (const type of ['loss_tier1', 'loss_tier2', 'loss_tier3'] as const) {
      if (!upline) break;
      const currentReferralId = upline.referralId;
      const referrer = await this.prisma.user.findUnique({
        where: { id: upline.id },
      });
      // Defensive: a malformed/looped chain must never pay the same person
      // twice for one month.
      if (!referrer || !referrer.referralEnabled || referrer.id === referredId) break;

      const tier = await this.vipService.getTierRow(referrer.vipLevel);
      const rate = tier ? tierRates[type](tier) : new Prisma.Decimal(0);
      if (tier && rate.greaterThan(0)) {
        const commissionAmount = netPrincipalLoss.mul(rate);
        if (commissionAmount.greaterThan(0)) {
          try {
            await this.prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: referrer.id },
                data: {
                  balance: { increment: commissionAmount },
                  lifetimeCommissionEarned: { increment: commissionAmount },
                },
              });
              // If this exact (referrer, sourceBettor, type, month)
              // combination was already paid — a retried/concurrent sweep
              // tick — this throws P2002 and rolls back the balance
              // increment above too (same transaction), instead of paying
              // twice.
              await tx.referralLossCommission.create({
                data: {
                  referrerId: referrer.id,
                  referredId,
                  sourceBettorId: bettorUserId,
                  referralId: currentReferralId,
                  type,
                  calculationMonth,
                  netPrincipalLoss,
                  commissionRate: rate,
                  commissionAmount,
                  referrerVipLevelAtEvent: referrer.vipLevel,
                },
              });
            });
            this.balanceService.notifyChanged(referrer.id);
            anyGranted = true;
          } catch (err) {
            if (
              !(
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002'
              )
            ) {
              throw err;
            }
            this.logger.log(
              `${type} loss commission for bettor ${bettorUserId}, ${calculationMonth.toISOString().slice(0, 7)} already recorded — skipped duplicate.`,
            );
          }
        }
      }

      // Walk up one more level: is THIS referrer themselves someone's
      // referred user?
      referredId = referrer.id;
      const nextReferral = await this.prisma.referral.findUnique({
        where: { referredId: referrer.id },
      });
      upline =
        nextReferral && nextReferral.status !== 'fraud_flagged'
          ? { id: nextReferral.referrerId, referralId: nextReferral.id }
          : null;
    }

    return anyGranted;
  }

  async adminGetLossCommissions(referrerId?: bigint, page = 1, pageSize = 30) {
    const where = referrerId ? { referrerId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.referralLossCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * Math.min(pageSize, 100),
        take: Math.min(pageSize, 100),
        include: {
          referrer: { select: { fullName: true, memberId: true } },
          referred: { select: { fullName: true, memberId: true } },
          sourceBettor: { select: { fullName: true, memberId: true } },
        },
      }),
      this.prisma.referralLossCommission.count({ where }),
    ]);
    return {
      total,
      commissions: rows.map((c) => ({
        id: c.id.toString(),
        referrerName: c.referrer.fullName,
        referrerMemberId: c.referrer.memberId,
        referredName: c.referred.fullName,
        referredMemberId: c.referred.memberId,
        sourceBettorName: c.sourceBettor.fullName,
        sourceBettorMemberId: c.sourceBettor.memberId,
        type: c.type,
        calculationMonth: c.calculationMonth.toISOString().slice(0, 7),
        netPrincipalLoss: c.netPrincipalLoss.toString(),
        commissionRate: c.commissionRate.toString(),
        commissionAmount: c.commissionAmount.toString(),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
