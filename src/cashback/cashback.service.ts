import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VipService } from '../vip/vip.service';
import { Prisma } from '../../generated/prisma/client';
import { startOfUTCDay } from '../common/date.util';
import {
  CASHBACK_MIN_LOSS,
  CASHBACK_TURNOVER_MULTIPLIER,
  CASHBACK_VALIDITY_DAYS,
  CASHBACK_SWEEP_CHECK_INTERVAL_MS,
} from './cashback-constants';

@Injectable()
export class CashbackService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CashbackService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vipService: VipService,
  ) {}

  onModuleInit(): void {
    void this.runDailySweep();
    this.sweepTimer = setInterval(() => {
      void this.runDailySweep();
    }, CASHBACK_SWEEP_CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Grants cashback for yesterday's net losses. Idempotent per user per day
   * (unique constraint on cashback_grants) — safe to call repeatedly, which
   * is exactly what the interval above does instead of a real once-daily
   * cron (no @nestjs/schedule dependency in this codebase).
   */
  async runDailySweep(): Promise<{ processed: number }> {
    const todayStart = startOfUTCDay(new Date());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    let processed = 0;

    try {
      const rows = await this.prisma.gameTransaction.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
        _sum: { betAmount: true, winAmount: true },
      });

      for (const row of rows) {
        try {
          const granted = await this.grantForUser(row.userId, yesterdayStart, {
            totalBet: row._sum.betAmount ?? new Prisma.Decimal(0),
            totalWin: row._sum.winAmount ?? new Prisma.Decimal(0),
          });
          if (granted) processed++;
        } catch (err) {
          this.logger.error(
            `Cashback grant failed for user ${row.userId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Cashback sweep query failed: ${(err as Error).message}`);
      return { processed: 0 };
    }

    if (processed > 0) {
      this.logger.log(`Cashback sweep: granted to ${processed} user(s) for ${yesterdayStart.toISOString().slice(0, 10)}`);
    }
    return { processed };
  }

  private async grantForUser(
    userId: bigint,
    calculationDate: Date,
    stats: { totalBet: Prisma.Decimal; totalWin: Prisma.Decimal },
  ): Promise<boolean> {
    const netLoss = stats.totalBet.sub(stats.totalWin);
    if (netLoss.lessThan(CASHBACK_MIN_LOSS)) return false;

    const existing = await this.prisma.cashbackGrant.findUnique({
      where: { userId_calculationDate: { userId, calculationDate } },
    });
    if (existing) return false;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;

    const tier = await this.vipService.getTierRow(user.vipLevel);
    if (!tier || tier.dailyCashbackPct.lessThanOrEqualTo(0)) return false;

    // dailyCashbackPct is a fraction (0.01 = 1%), same convention as every
    // other pct field on VipTier.
    const cashbackAmount = netLoss.mul(tier.dailyCashbackPct);
    if (cashbackAmount.lessThanOrEqualTo(0)) return false;

    const turnoverRequired = cashbackAmount.mul(CASHBACK_TURNOVER_MULTIPLIER);
    const expiresAt = new Date(Date.now() + CASHBACK_VALIDITY_DAYS * 86_400_000);

    await this.prisma.$transaction(async (tx) => {
      const bw = await tx.bonusWallet.create({
        data: {
          userId,
          type: 'daily_cashback',
          amount: cashbackAmount,
          turnoverRequired,
          expiresAt,
          metadata: {
            calculationDate: calculationDate.toISOString().slice(0, 10),
            netLoss: netLoss.toString(),
          },
        },
      });
      await tx.cashbackGrant.create({
        data: {
          userId,
          calculationDate,
          netLoss,
          cashbackRate: tier.dailyCashbackPct,
          cashbackAmount,
          vipLevelAtCalculation: user.vipLevel,
          bonusWalletId: bw.id,
          totalBetPrevDay: stats.totalBet,
          totalWinPrevDay: stats.totalWin,
        },
      });
    });

    return true;
  }

  async getUserCashbackHistory(userId: bigint, limit = 30) {
    const history = await this.prisma.cashbackGrant.findMany({
      where: { userId },
      orderBy: { calculationDate: 'desc' },
      take: limit,
    });
    return history.map((g) => ({
      date: g.calculationDate.toISOString().slice(0, 10),
      netLoss: g.netLoss.toString(),
      rate: g.cashbackRate.toString(),
      amount: g.cashbackAmount.toString(),
    }));
  }

  // --- Admin (CRM) ---

  async adminListGrants(params: { userId?: bigint; page?: number; pageSize?: number }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 30, 100);
    const where = params.userId ? { userId: params.userId } : {};

    const [rows, total] = await Promise.all([
      this.prisma.cashbackGrant.findMany({
        where,
        orderBy: { calculationDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { fullName: true, memberId: true } } },
      }),
      this.prisma.cashbackGrant.count({ where }),
    ]);

    return {
      total,
      grants: rows.map((g) => ({
        id: g.id.toString(),
        userName: g.user.fullName,
        memberId: g.user.memberId,
        date: g.calculationDate.toISOString().slice(0, 10),
        netLoss: g.netLoss.toString(),
        rate: g.cashbackRate.toString(),
        amount: g.cashbackAmount.toString(),
        vipLevel: g.vipLevelAtCalculation,
      })),
    };
  }
}
