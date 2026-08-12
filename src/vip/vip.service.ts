import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';
import { Prisma } from '../../generated/prisma/client';
import { VIP_MAX_LEVEL, generateTier, type GeneratedTier } from './vip-constants';

type VipTierRow = Prisma.VipTierGetPayload<object>;
type UserRow = Prisma.UserGetPayload<object>;

function tierToPublic(t: VipTierRow) {
  return {
    level: t.level,
    groupName: t.groupName,
    nameBn: t.nameBn,
    nameEn: t.nameEn,
    requiredDeposit: t.requiredDeposit.toString(),
    requiredBet: t.requiredBet.toString(),
    bonusAmount: t.bonusAmount.toString(),
    turnoverMultiplier: t.turnoverMultiplier.toString(),
    bonusValidityDays: t.bonusValidityDays,
    referralSignupBonus: t.referralSignupBonus.toString(),
    referralBetCommissionPct: t.referralBetCommissionPct.toString(),
    dailyCashbackPct: t.dailyCashbackPct.toString(),
  };
}

@Injectable()
export class VipService implements OnModuleInit {
  private readonly logger = new Logger(VipService.name);
  private tiersCache: VipTierRow[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
  ) {}

  async onModuleInit() {
    await this.ensureSeeded();
    await this.loadCache();
  }

  // Idempotent — only ever inserts when the table is empty, so redeploys and
  // multi-instance boots never duplicate or clobber CRM-edited tiers.
  private async ensureSeeded() {
    const count = await this.prisma.vipTier.count();
    if (count > 0) return;

    const rows: GeneratedTier[] = [];
    for (let level = 0; level <= VIP_MAX_LEVEL; level++) {
      rows.push(generateTier(level));
    }
    await this.prisma.vipTier.createMany({ data: rows });
    this.logger.log(`Seeded ${rows.length} VIP tiers (0-${VIP_MAX_LEVEL}).`);
  }

  async loadCache() {
    this.tiersCache = await this.prisma.vipTier.findMany({
      orderBy: { level: 'asc' },
    });
    return this.tiersCache;
  }

  private async getTiers(): Promise<VipTierRow[]> {
    return this.tiersCache ?? this.loadCache();
  }

  async getAllTiers() {
    const tiers = await this.getTiers();
    return tiers.map(tierToPublic);
  }

  async getUserVipStatus(userId: bigint) {
    const [user, tiers] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.getTiers(),
    ]);

    const current = tiers.find((t) => t.level === user.vipLevel) ?? tiers[0];
    const next = tiers.find((t) => t.level === user.vipLevel + 1) ?? null;

    const depositProgress = next
      ? Math.min(
          100,
          Number(
            user.lifetimeDepositAmount.div(next.requiredDeposit).mul(100).toFixed(1),
          ),
        )
      : 100;
    const betProgress = next
      ? Math.min(
          100,
          Number(user.lifetimeBetAmount.div(next.requiredBet).mul(100).toFixed(1)),
        )
      : 100;

    return {
      level: user.vipLevel,
      lifetimeDepositAmount: user.lifetimeDepositAmount.toString(),
      lifetimeBetAmount: user.lifetimeBetAmount.toString(),
      vipUpgradedAt: user.vipUpgradedAt?.toISOString() ?? null,
      current: tierToPublic(current),
      next: next ? tierToPublic(next) : null,
      depositProgressPercent: depositProgress,
      betProgressPercent: betProgress,
    };
  }

  /** Called after a deposit is approved. Not fault-isolated internally — callers
   *  wrap this so a bug here can never block or roll back the deposit itself. */
  async recordDeposit(userId: bigint, amount: Prisma.Decimal) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lifetimeDepositAmount: { increment: amount } },
    });
    await this.checkAndUpgrade(userId);
  }

  /** Called on every real-money bet (Oracle callback). Same fault-isolation
   *  contract as recordDeposit — callers wrap this, not this method itself. */
  async recordBet(userId: bigint, amount: Prisma.Decimal) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lifetimeBetAmount: { increment: amount } },
    });
    await this.checkAndUpgrade(userId);
  }

  // Loops so a single deposit/bet that jumps multiple thresholds at once
  // (e.g. a big first deposit) awards every level crossed, not just one.
  private async checkAndUpgrade(userId: bigint) {
    const tiers = await this.getTiers();

    for (;;) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const next = tiers.find((t) => t.level === user.vipLevel + 1);
      if (!next) break;

      const meetsDeposit = user.lifetimeDepositAmount.greaterThanOrEqualTo(next.requiredDeposit);
      const meetsBet = user.lifetimeBetAmount.greaterThanOrEqualTo(next.requiredBet);
      if (!meetsDeposit || !meetsBet) break;

      await this.upgradeUserToLevel(user, next);
    }
  }

  private async upgradeUserToLevel(user: UserRow, tier: VipTierRow) {
    const fromLevel = user.vipLevel;

    await this.prisma.$transaction(async (tx) => {
      let bonusWalletId: bigint | null = null;

      if (tier.bonusAmount.greaterThan(0)) {
        const turnoverRequired = tier.bonusAmount.mul(tier.turnoverMultiplier);
        const expiresAt = tier.bonusValidityDays
          ? new Date(Date.now() + tier.bonusValidityDays * 86_400_000)
          : null;

        const bw = await tx.bonusWallet.create({
          data: {
            userId: user.id,
            type: `vip_level_${tier.level}`,
            amount: tier.bonusAmount,
            turnoverRequired,
            expiresAt,
            metadata: { vipLevel: tier.level, reason: 'vip_levelup' },
          },
        });
        bonusWalletId = bw.id;
      }

      await tx.vipUpgradeLog.create({
        data: {
          userId: user.id,
          fromLevel,
          toLevel: tier.level,
          lifetimeDepositAtUpgrade: user.lifetimeDepositAmount,
          lifetimeBetAtUpgrade: user.lifetimeBetAmount,
          bonusWalletId,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { vipLevel: tier.level, vipUpgradedAt: new Date() },
      });
    });

    this.logger.log(`User ${user.id} VIP upgrade: ${fromLevel} -> ${tier.level}`);

    // Best-effort: an admin-configured vip_levelup offer layering an extra
    // bonus on top must never fail the upgrade itself, which already happened above.
    try {
      await this.offersService.processTrigger({
        type: 'vip_levelup',
        userId: user.id,
        newLevel: tier.level,
      });
    } catch (err) {
      this.logger.error(
        `vip_levelup offer trigger failed for user ${user.id}: ${(err as Error).message}`,
      );
    }
  }

  // --- Admin (CRM) ---

  async adminUpdateTier(
    level: number,
    data: Partial<{
      nameBn: string;
      nameEn: string;
      requiredDeposit: number;
      requiredBet: number;
      bonusAmount: number;
      turnoverMultiplier: number;
      bonusValidityDays: number | null;
      referralSignupBonus: number;
      referralBetCommissionPct: number;
      dailyCashbackPct: number;
    }>,
  ) {
    const existing = await this.prisma.vipTier.findUnique({ where: { level } });
    if (!existing) throw new NotFoundException('VIP tier not found.');

    const updated = await this.prisma.vipTier.update({
      where: { level },
      data: { ...data, updatedAt: new Date() },
    });
    await this.loadCache();
    return tierToPublic(updated);
  }

  async adminManualOverride(
    userId: bigint,
    toLevel: number,
    reason: string,
    overrideBy: string,
  ) {
    const [user, tier] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.vipTier.findUnique({ where: { level: toLevel } }),
    ]);
    if (!tier) throw new NotFoundException('VIP tier not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.vipUpgradeLog.create({
        data: {
          userId: user.id,
          fromLevel: user.vipLevel,
          toLevel,
          lifetimeDepositAtUpgrade: user.lifetimeDepositAmount,
          lifetimeBetAtUpgrade: user.lifetimeBetAmount,
          isManualOverride: true,
          overrideReason: reason,
          overrideBy,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { vipLevel: toLevel, vipUpgradedAt: new Date() },
      });
    });

    this.logger.log(
      `Admin ${overrideBy} manually set user ${user.id} VIP level ${user.vipLevel} -> ${toLevel} (${reason})`,
    );
    return { success: true };
  }

  async adminGetUpgradeHistory(userId?: bigint, page = 1, pageSize = 30) {
    const where = userId ? { userId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.vipUpgradeLog.findMany({
        where,
        include: { user: { select: { fullName: true, memberId: true, phoneNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vipUpgradeLog.count({ where }),
    ]);

    return {
      total,
      logs: rows.map((r) => ({
        id: r.id.toString(),
        userId: r.userId.toString(),
        fullName: r.user.fullName,
        memberId: r.user.memberId,
        phoneNumber: r.user.phoneNumber,
        fromLevel: r.fromLevel,
        toLevel: r.toLevel,
        isManualOverride: r.isManualOverride,
        overrideReason: r.overrideReason,
        overrideBy: r.overrideBy,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async adminGetDistribution() {
    const rows = await this.prisma.user.groupBy({
      by: ['vipLevel'],
      _count: { _all: true },
    });
    const counts = new Map(rows.map((r) => [r.vipLevel, r._count._all]));
    const tiers = await this.getTiers();
    return tiers.map((t) => ({
      level: t.level,
      nameEn: t.nameEn,
      nameBn: t.nameBn,
      userCount: counts.get(t.level) ?? 0,
    }));
  }
}
