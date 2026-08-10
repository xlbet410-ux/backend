import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class BonusService {
  private readonly logger = new Logger(BonusService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called on every real-money bet (Oracle callback). FIFO: only the single
   * oldest active, non-expired bonus for this user ever receives turnover.
   * Once it completes, its amount moves to the user's real balance and any
   * leftover bet amount rolls into the next-oldest bonus in the same call.
   */
  async processTurnover(userId: bigint, betAmount: Prisma.Decimal) {
    let remainingBet = betAmount;

    while (remainingBet.greaterThan(0)) {
      const oldest = await this.prisma.bonusWallet.findFirst({
        where: { userId, status: 'active', expiresAt: { gt: new Date() } },
        orderBy: { claimedAt: 'asc' },
      });
      if (!oldest) break;

      const remainingTurnover = oldest.turnoverRequired.sub(
        oldest.turnoverDone,
      );
      const contribution = Prisma.Decimal.min(remainingBet, remainingTurnover);
      const newDone = oldest.turnoverDone.add(contribution);
      const isComplete = newDone.greaterThanOrEqualTo(oldest.turnoverRequired);

      await this.prisma.$transaction(async (tx) => {
        await tx.bonusWallet.update({
          where: { id: oldest.id },
          data: {
            turnoverDone: newDone,
            status: isComplete ? 'completed' : 'active',
            completedAt: isComplete ? new Date() : null,
          },
        });

        if (isComplete) {
          await tx.user.update({
            where: { id: userId },
            data: { balance: { increment: oldest.amount } },
          });
        }
      });

      remainingBet = remainingBet.sub(contribution);
      if (!isComplete) break; // FIFO — stop, don't spill into the next bonus
    }
  }

  /** Withdrawal gate: blocked while any bonus still has pending turnover. */
  async canWithdraw(userId: bigint): Promise<{
    allowed: boolean;
    reason?: string;
    pendingBonuses: Array<{
      id: string;
      type: string;
      amount: string;
      turnoverRequired: string;
      turnoverDone: string;
      progressPercent: number;
      daysLeft: number;
    }>;
  }> {
    const active = await this.prisma.bonusWallet.findMany({
      where: { userId, status: 'active', expiresAt: { gt: new Date() } },
      orderBy: { claimedAt: 'asc' },
    });

    const pendingBonuses = active.map((b) => {
      const daysLeft = b.expiresAt
        ? Math.max(
            0,
            Math.ceil((b.expiresAt.getTime() - Date.now()) / 86_400_000),
          )
        : 999;
      return {
        id: b.id.toString(),
        type: b.type,
        amount: b.amount.toString(),
        turnoverRequired: b.turnoverRequired.toString(),
        turnoverDone: b.turnoverDone.toString(),
        progressPercent: Number(
          b.turnoverDone.div(b.turnoverRequired).mul(100).toFixed(1),
        ),
        daysLeft,
      };
    });

    return {
      allowed: active.length === 0,
      reason:
        active.length > 0
          ? `You have ${active.length} active bonus(es) with pending turnover.`
          : undefined,
      pendingBonuses,
    };
  }

  /** User voluntarily gives up a bonus (and its remaining turnover) to withdraw sooner. */
  async forfeitBonus(userId: bigint, bonusWalletId: bigint) {
    const bonus = await this.prisma.bonusWallet.findFirst({
      where: { id: bonusWalletId, userId, status: 'active' },
    });
    if (!bonus) {
      throw new NotFoundException('Bonus not found or not active.');
    }

    await this.prisma.bonusWallet.update({
      where: { id: bonusWalletId },
      data: { status: 'forfeited', completedAt: new Date() },
    });
    return { success: true };
  }

  /** Daily sweep — mark bonuses past expiresAt as expired (money lost). */
  async expireOldBonuses(): Promise<number> {
    const result = await this.prisma.bonusWallet.updateMany({
      where: { status: 'active', expiresAt: { lt: new Date() } },
      data: { status: 'expired', completedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} bonus wallet(s).`);
    }
    return result.count;
  }

  async getUserBonuses(userId: bigint) {
    const bonuses = await this.prisma.bonusWallet.findMany({
      where: { userId },
      orderBy: { claimedAt: 'asc' },
    });

    const active = bonuses.filter(
      (b) => b.status === 'active' && b.expiresAt && b.expiresAt > new Date(),
    );

    const toPublic = (b: (typeof bonuses)[number]) => ({
      id: b.id.toString(),
      type: b.type,
      amount: b.amount.toString(),
      turnoverRequired: b.turnoverRequired.toString(),
      turnoverDone: b.turnoverDone.toString(),
      status: b.status,
      expiresAt: b.expiresAt?.toISOString() ?? null,
      claimedAt: b.claimedAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
    });

    return {
      active: active[0] ? toPublic(active[0]) : null,
      queued: active.slice(1).map(toPublic),
      completed: bonuses.filter((b) => b.status === 'completed').map(toPublic),
      forfeited: bonuses.filter((b) => b.status === 'forfeited').map(toPublic),
      expired: bonuses.filter((b) => b.status === 'expired').map(toPublic),
    };
  }
}
