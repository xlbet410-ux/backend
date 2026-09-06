import { Prisma } from '../../generated/prisma/client';

/**
 * Collapses raw provider callbacks into one entry per round.
 *
 * A round reaches us as more than one callback: the stake first
 * (bet > 0, win 0), then the settlement (bet 0, win >= 0 — zero when the
 * round was lost). Each has its own serial_number, which is the
 * idempotency key. Displayed one card per row, a single spin therefore
 * appeared twice, and the settlement half read "staked 0, returned X",
 * which looks like a win with no stake behind it.
 *
 * Two ways to tie the halves back together, tried in that order:
 *
 *  1. game_round, when the provider actually repeats it across both
 *     callbacks. Authoritative when present, so it wins.
 *  2. Otherwise, shape and order: each settlement is matched to the
 *     oldest still-unsettled stake for the same game. Aviator does not
 *     appear to repeat its round id across the two calls, and this is
 *     the only signal left once that is gone.
 *
 * Deliberately conservative. A callback carrying both a stake and a win
 * is already a whole round and is never merged into anything, and a
 * settlement with no stake in range stays on its own rather than
 * attaching itself to an unrelated bet.
 */

export type RawGameRow = {
  id: bigint;
  gameUid: string;
  gameRound: string;
  betAmount: Prisma.Decimal;
  winAmount: Prisma.Decimal;
  createdAt: Date;
};

export type GameRound = {
  id: string;
  gameUid: string;
  bet: Prisma.Decimal;
  win: Prisma.Decimal;
  createdAt: Date;
};

const ZERO = new Prisma.Decimal(0);

function startRound(row: RawGameRow): GameRound {
  return {
    id: row.id.toString(),
    gameUid: row.gameUid,
    bet: row.betAmount,
    win: row.winAmount,
    createdAt: row.createdAt,
  };
}

export function groupIntoRounds(rows: RawGameRow[]): GameRound[] {
  // Oldest first, so a stake is always seen before the settlement that
  // closes it. The two often share a timestamp to the second, so id
  // breaks the tie — it follows the order the callbacks arrived in.
  const chronological = [...rows].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // A round id only tells us anything if more than one row carries it.
  const rowsPerRoundId = new Map<string, number>();
  for (const row of chronological) {
    if (!row.gameRound) continue;
    const key = `${row.gameUid}::${row.gameRound}`;
    rowsPerRoundId.set(key, (rowsPerRoundId.get(key) ?? 0) + 1);
  }

  const rounds: GameRound[] = [];
  const byRoundId = new Map<string, GameRound>();
  // Per game: stakes still waiting to be settled, oldest first.
  const unsettled = new Map<string, GameRound[]>();

  for (const row of chronological) {
    const roundKey = row.gameRound ? `${row.gameUid}::${row.gameRound}` : '';
    const roundIdGroupsRows =
      roundKey && (rowsPerRoundId.get(roundKey) ?? 0) > 1;

    if (roundIdGroupsRows) {
      const open = byRoundId.get(roundKey);
      if (open) {
        open.bet = open.bet.add(row.betAmount);
        open.win = open.win.add(row.winAmount);
        if (row.createdAt > open.createdAt) open.createdAt = row.createdAt;
        continue;
      }
      const round = startRound(row);
      byRoundId.set(roundKey, round);
      rounds.push(round);
      continue;
    }

    const isStake =
      row.betAmount.greaterThan(ZERO) && row.winAmount.equals(ZERO);
    const isSettlement = row.betAmount.equals(ZERO);

    if (isSettlement) {
      const waiting = unsettled.get(row.gameUid);
      const stake = waiting?.shift();
      if (stake) {
        stake.win = stake.win.add(row.winAmount);
        if (row.createdAt > stake.createdAt) stake.createdAt = row.createdAt;
        continue;
      }
    }

    const round = startRound(row);
    rounds.push(round);
    if (isStake) {
      const waiting = unsettled.get(row.gameUid) ?? [];
      waiting.push(round);
      unsettled.set(row.gameUid, waiting);
    }
  }

  // Back to newest first, which is how every caller displays them.
  return rounds.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function toRoundResponse(round: GameRound, gameName: string) {
  return {
    id: round.id,
    gameUid: round.gameUid,
    gameName,
    betAmount: round.bet.toString(),
    winAmount: round.win.toString(),
    net: round.win.sub(round.bet).toString(),
    createdAt: round.createdAt.toISOString(),
  };
}
