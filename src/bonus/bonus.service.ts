import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceService } from '../balance/balance.service';
import { Prisma } from '../../generated/prisma/client';

// A deposit's own 1x turnover requirement, created alongside every approved
// cash_in (see TransactionsService.approve) — stands for "you must wager
// your deposit once," stacking with whatever real bonus turnover is also
// pending, exactly like the spec: deposit ৳500 (1x = ৳500) + signup bonus
// ৳200 (3x = ৳600) = ৳1100 combined before any of it is withdrawable.
export const DEPOSIT_TURNOVER_TYPE = 'deposit_turnover';

// Real bonuses always carry an expiresAt; deposit-turnover entries never do
// (the money is already the player's own, nothing to time out) — a plain
// `expiresAt: { gt: now }` filter would silently exclude null forever, since
// SQL null comparisons are never true. This treats null as "never expires."
// A function, not a static object — must evaluate `new Date()` fresh on
// every call, not once at module load.
function activeExpiryFilter() {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

@Injectable()
export class BonusService {
  private readonly logger = new Logger(BonusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: BalanceService,
  ) {}

  /**
   * Called on every real-money bet (Oracle callback). FIFO: only the single
   * oldest active, non-expired bonus for this user ever receives turnover;
   * any leftover bet amount rolls into the next-oldest bonus in the same
   * call. Every bonus type's amount is credited to the user's real balance
   * immediately at grant time (see ReferralService/VipService/OffersService/
   * CashbackService, and TransactionsService.approve for deposits) — this
   * only tracks progress toward the turnover requirement that gates
   * withdrawal (see canWithdraw), it never touches balance itself.
   */
  async processTurnover(userId: bigint, betAmount: Prisma.Decimal) {
    let remainingBet = betAmount;

    while (remainingBet.greaterThan(0)) {
      const oldest = await this.prisma.bonusWallet.findFirst({
        where: { userId, status: 'active', ...activeExpiryFilter() },
        orderBy: { claimedAt: 'asc' },
      });
      if (!oldest) break;

      const remainingTurnover = oldest.turnoverRequired.sub(
        oldest.turnoverDone,
      );
      const contribution = Prisma.Decimal.min(remainingBet, remainingTurnover);
      const newDone = oldest.turnoverDone.add(contribution);
      const isComplete = newDone.greaterThanOrEqualTo(oldest.turnoverRequired);

      await this.prisma.bonusWallet.update({
        where: { id: oldest.id },
        data: {
          turnoverDone: newDone,
          status: isComplete ? 'completed' : 'active',
          completedAt: isComplete ? new Date() : null,
        },
      });

      remainingBet = remainingBet.sub(contribution);
      if (!isComplete) break; // FIFO — stop, don't spill into the next bonus
    }
  }

  /**
   * Withdrawal gate. Every deposit carries its own 1x turnover requirement
   * (see DEPOSIT_TURNOVER_TYPE) alongside whatever real bonus turnover is
   * also active, and ALL of it must clear before ANYTHING is withdrawable —
   * e.g. a ৳500 deposit (1x = ৳500) plus a ৳200 signup bonus (3x = ৳600) is
   * a combined ৳1100 that must be wagered first. Once every active entry is
   * cleared, the full balance is withdrawable.
   */
  async canWithdraw(
    userId: bigint,
    requestedAmount?: Prisma.Decimal,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    maxWithdrawable: string;
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
    const [active, user] = await Promise.all([
      this.prisma.bonusWallet.findMany({
        where: { userId, status: 'active', ...activeExpiryFilter() },
        orderBy: { claimedAt: 'asc' },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    ]);

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

    const hasPending = active.length > 0;
    const maxWithdrawable = hasPending ? new Prisma.Decimal(0) : user.balance;

    const allowed = hasPending
      ? false
      : requestedAmount === undefined
        ? maxWithdrawable.greaterThan(0)
        : requestedAmount.greaterThan(0) &&
          requestedAmount.lessThanOrEqualTo(maxWithdrawable);

    return {
      allowed,
      reason: hasPending
        ? `You have ${active.length} pending turnover requirement(s) (deposit and/or bonus) totalling ৳${active.reduce((sum, b) => sum.add(b.turnoverRequired.sub(b.turnoverDone)), new Prisma.Decimal(0)).toFixed(2)} left to wager before you can withdraw.`
        : !allowed
          ? 'Withdrawal amount exceeds your available balance.'
          : undefined,
      maxWithdrawable: maxWithdrawable.toString(),
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
    if (bonus.type === DEPOSIT_TURNOVER_TYPE) {
      throw new BadRequestException(
        "This is your deposit's own turnover requirement, not a bonus — it can't be forfeited, only wagered off.",
      );
    }

    // The bonus amount was credited to balance the moment it was granted
    // (see e.g. ReferralService.checkReferralMilestone), so giving it up
    // must claw that back — otherwise forfeiting would be a way to keep
    // bonus money without ever completing its turnover. Clamped to whatever
    // balance remains: if it's already been lost on real bets, there's
    // nothing left to reclaim.
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const reclaim = Prisma.Decimal.min(bonus.amount, user.balance);
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: reclaim } },
      });
      await tx.bonusWallet.update({
        where: { id: bonusWalletId },
        data: { status: 'forfeited', completedAt: new Date() },
      });
    });
    this.balanceService.notifyChanged(userId);
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
      (b) => b.status === 'active' && (!b.expiresAt || b.expiresAt > new Date()),
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
