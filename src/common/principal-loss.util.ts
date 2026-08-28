import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { DEPOSIT_TURNOVER_TYPE } from '../bonus/bonus.service';

/**
 * Net loss (bets minus wins) for one user since `monthStart`, counting only
 * bets placed with their own principal — not offer/bonus money. There's no
 * per-bet ledger of which pool funded a given stake (every bonus type is
 * credited straight into the single pooled `user.balance` — see
 * BonusService.processTurnover's docstring), so a bet can only be *provably*
 * principal-funded when no bonus was active at all at that moment: with
 * nothing else in the balance, the whole balance was principal by
 * construction (same accounting the wallet page's own Main Wallet vs
 * Turnover Wallet split already relies on — see BonusService.
 * getWalletSummary). Deposit-turnover entries don't count as "a bonus was
 * active" here, matching that same precedent: a deposit's own 1x turnover
 * requirement never hides the deposit itself from Main Wallet, so it
 * shouldn't disqualify a bet from being principal either. Any bet placed
 * while a real bonus WAS active is excluded entirely (not partially
 * counted) rather than guessed at.
 *
 * Shared by OffersService (a single game's monthly loss, for a loss-
 * triggered offer) and ReferralService (every game, for the monthly loss
 * commission) — pass `gameUid` to scope to one game, omit it to cover
 * everything the user played.
 */
export async function computeMonthlyPrincipalLoss(
  prisma: PrismaService,
  userId: bigint,
  monthStart: Date,
  gameUid?: string,
): Promise<Prisma.Decimal> {
  const [transactions, bonusWallets] = await Promise.all([
    prisma.gameTransaction.findMany({
      where: {
        userId,
        createdAt: { gte: monthStart },
        ...(gameUid ? { gameUid } : {}),
      },
      select: { betAmount: true, winAmount: true, createdAt: true },
    }),
    prisma.bonusWallet.findMany({
      where: { userId, type: { not: DEPOSIT_TURNOVER_TYPE } },
      select: { claimedAt: true, completedAt: true },
    }),
  ]);

  const isPrincipalFunded = (at: Date) =>
    !bonusWallets.some(
      (b) => b.claimedAt <= at && (!b.completedAt || b.completedAt > at),
    );

  let net = new Prisma.Decimal(0);
  for (const tx of transactions) {
    if (!isPrincipalFunded(tx.createdAt)) continue;
    net = net.add(tx.betAmount).sub(tx.winAmount);
  }
  return net;
}
