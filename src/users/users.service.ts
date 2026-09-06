import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from '../games/games.service';
import { Prisma } from '../../generated/prisma/client';

// The CRM's Game History tab covers a rolling week of play rather than a
// fixed row count — a take:100 silently cut an active player off mid-week
// with nothing in the UI saying so. Cash transactions and bonus wallets
// deliberately keep their own take:100 (see getFullHistory).
const GAME_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type UserWithDetails = {
  id: bigint;
  memberId: string;
  fullName: string;
  phoneNumber: string;
  referralCode: string | null;
  ownReferralCode: string | null;
  isAdult: boolean;
  agreedTerms: boolean;
  balance: unknown;
  isActive: boolean;
  vipLevel: number;
  gameAccount: string | null;
  nineWicketAccount: string | null;
  createdAt: Date;
  updatedAt: Date;
  kycVerification: { status: string } | null;
  cashTransactions: { type: string; amount: unknown }[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamesService: GamesService,
  ) {}

  private toDetail(
    u: UserWithDetails,
    precomputedTotals?: { cashIn: number; cashOut: number },
  ) {
    let totalCashIn = precomputedTotals?.cashIn ?? 0;
    let totalCashOut = precomputedTotals?.cashOut ?? 0;
    if (!precomputedTotals) {
      for (const tx of u.cashTransactions) {
        if (tx.type === 'cash_in') totalCashIn += Number(tx.amount);
        else totalCashOut += Number(tx.amount);
      }
    }
    return {
      id: u.id.toString(),
      memberId: u.memberId,
      fullName: u.fullName,
      phoneNumber: u.phoneNumber,
      referralCode: u.referralCode,
      ownReferralCode: u.ownReferralCode,
      isAdult: u.isAdult,
      agreedTerms: u.agreedTerms,
      balance: Number(u.balance),
      isActive: u.isActive,
      vipLevel: u.vipLevel,
      // The auto-generated Oracle launch usernames (see GamesService.
      // ensureGameAccount / ensureNineWicketAccount) — null until the
      // player's first launch of that kind. Surfaced here for staff to
      // reproduce/debug a launch issue directly against Oracle's API.
      gameAccount: u.gameAccount,
      nineWicketAccount: u.nineWicketAccount,
      kycStatus: u.kycVerification?.status ?? 'none',
      totalCashIn,
      totalCashOut,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'desc' },
      include: { kycVerification: true },
    });

    // A single aggregate over every completed transaction, grouped by
    // (userId, type) — instead of the old approach, which nested every
    // user's full completed-transaction history into the query and summed
    // it in JS per user. That transferred and held an unbounded array per
    // user just to compute two totals; this computes the totals in the DB
    // and merges them in O(1) per user.
    const totals = await this.prisma.cashTransaction.groupBy({
      by: ['userId', 'type'],
      where: { status: 'completed' },
      _sum: { amount: true },
    });
    const totalsByUser = new Map<string, { cashIn: number; cashOut: number }>();
    for (const row of totals) {
      const key = row.userId.toString();
      const entry = totalsByUser.get(key) ?? { cashIn: 0, cashOut: 0 };
      const sum = Number(row._sum.amount ?? 0);
      if (row.type === 'cash_in') entry.cashIn += sum;
      else entry.cashOut += sum;
      totalsByUser.set(key, entry);
    }

    return users.map((u) => {
      const t = totalsByUser.get(u.id.toString());
      return this.toDetail({ ...u, cashTransactions: [] }, t);
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      include: {
        kycVerification: true,
        cashTransactions: {
          where: { status: 'completed' },
          select: { type: true, amount: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return this.toDetail(user);
  }

  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive },
    });
    return { success: true };
  }

  // Full player-360 view for the CRM's user detail page — transactions,
  // every bonus ever granted (VIP/offer/referral/cashback/deposit-turnover,
  // all share the same BonusWallet table), and bet-by-bet game history.
  // Capped at the most recent 100 of each — this is a review screen, not an
  // export.
  async getFullHistory(id: string) {
    const userId = BigInt(id);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const [transactions, bonusWallets, gameTransactions, nameByUid] =
      await Promise.all([
        this.prisma.cashTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.bonusWallet.findMany({
          where: { userId },
          orderBy: { claimedAt: 'desc' },
          take: 100,
        }),
        this.prisma.gameTransaction.findMany({
          where: {
            userId,
            createdAt: { gte: new Date(Date.now() - GAME_HISTORY_WINDOW_MS) },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.gamesService.getGameNameMap(),
      ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id.toString(),
        type: t.type,
        method: t.method,
        amount: t.amount.toString(),
        status: t.status,
        reference: t.reference,
        createdAt: t.createdAt.toISOString(),
      })),
      bonusWallets: bonusWallets.map((b) => ({
        id: b.id.toString(),
        type: b.type,
        amount: b.amount.toString(),
        turnoverRequired: b.turnoverRequired.toString(),
        turnoverDone: b.turnoverDone.toString(),
        status: b.status,
        claimedAt: b.claimedAt.toISOString(),
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
      gameTransactions: this.toRoundHistory(gameTransactions, nameByUid),
    };
  }

  /**
   * Collapses raw provider callbacks into one entry per round.
   *
   * A round is settled in more than one callback: the stake arrives first,
   * the payout second, each with its own serial_number (the idempotency
   * key) but sharing the same game_round. Rendered one card per row, a
   * single spin therefore showed up twice, and the payout half read
   * "bet 0, win X" — which looks like a player winning without staking
   * anything, but is just the other half of a bet recorded moments
   * earlier. Summing by round puts the stake and the payout back together.
   *
   * Keyed by gameUid as well as game_round, so a round id that a different
   * provider happens to reuse can never merge two unrelated games. Betting
   * twice in one round (Aviator allows exactly this) correctly collapses
   * into a single round showing total staked and total returned.
   */
  private toRoundHistory(
    rows: {
      id: bigint;
      gameUid: string;
      gameRound: string;
      betAmount: Prisma.Decimal;
      winAmount: Prisma.Decimal;
      createdAt: Date;
    }[],
    nameByUid: Map<string, string>,
  ) {
    const rounds = new Map<
      string,
      {
        id: string;
        gameUid: string;
        bet: Prisma.Decimal;
        win: Prisma.Decimal;
        createdAt: Date;
      }
    >();

    for (const row of rows) {
      // A blank round id can't identify anything, so those rows stay
      // separate (keyed by their own id) rather than collapsing every bet
      // on that game into one meaningless card.
      const key = row.gameRound
        ? `${row.gameUid}::${row.gameRound}`
        : `row::${row.id.toString()}`;
      const round = rounds.get(key);
      if (round) {
        round.bet = round.bet.add(row.betAmount);
        round.win = round.win.add(row.winAmount);
        continue;
      }
      // Rows arrive newest-first, so the first one seen for a round is its
      // latest event, and Map preserves that order for the response.
      rounds.set(key, {
        id: row.id.toString(),
        gameUid: row.gameUid,
        bet: row.betAmount,
        win: row.winAmount,
        createdAt: row.createdAt,
      });
    }

    return [...rounds.values()].map((r) => ({
      id: r.id,
      gameUid: r.gameUid,
      gameName: nameByUid.get(r.gameUid) ?? r.gameUid,
      betAmount: r.bet.toString(),
      winAmount: r.win.toString(),
      net: r.win.sub(r.bet).toString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    // Every table referencing a user (conversations, KYC verification, game
    // transactions, bonus wallets, offer claims, VIP upgrades, referrals and
    // their commissions, cashback grants, login streak logs, notifications,
    // ...) cascades — onDelete: Cascade in schema.prisma — so no manual
    // cleanup is needed here.
    await this.prisma.user.delete({ where: { id: user.id } });
    return { success: true };
  }
}
