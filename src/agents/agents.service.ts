import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentLoginDto } from './dto/agent-login.dto';
import { AgentChangePasswordDto } from './dto/agent-change-password.dto';

const SALT_ROUNDS = 10;

type AgentRow = {
  id: bigint;
  fullName: string;
  phoneNumber: string;
  commission: unknown;
  accountLimit: unknown;
  isActive: boolean;
  type: string;
  referralCode: string | null;
  createdAt: Date;
  paymentAccounts: {
    id: bigint;
    method: string;
    label: string;
    accountNumber: string;
    accountName: string | null;
    details: string | null;
    isActive: boolean;
    createdAt: Date;
  }[];
};

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Same shape for the admin list/detail view and what an agent sees about
  // themselves after logging in — never includes the password hash.
  private toAdmin(agent: AgentRow) {
    return {
      id: agent.id.toString(),
      fullName: agent.fullName,
      phoneNumber: agent.phoneNumber,
      commission: Number(agent.commission),
      accountLimit: Number(agent.accountLimit),
      isActive: agent.isActive,
      type: agent.type,
      referralCode: agent.referralCode,
      createdAt: agent.createdAt.toISOString(),
      paymentAccounts: agent.paymentAccounts.map((p) => ({
        id: p.id.toString(),
        method: p.method,
        label: p.label,
        accountNumber: p.accountNumber,
        accountName: p.accountName,
        details: p.details,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  private async generateAgentReferralCode(): Promise<string> {
    for (;;) {
      const code = `AG${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const existing = await this.prisma.agent.findUnique({
        where: { referralCode: code },
      });
      if (!existing) return code;
    }
  }

  async findAll() {
    const agents = await this.prisma.agent.findMany({
      include: { paymentAccounts: true },
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((a) => this.toAdmin(a));
  }

  async findOne(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
      include: { paymentAccounts: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    return this.toAdmin(agent);
  }

  async create(dto: CreateAgentDto) {
    const existing = await this.prisma.agent.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existing) {
      throw new ConflictException(
        'An agent with this phone number already exists.',
      );
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, SALT_ROUNDS)
      : null;
    const referralCode = await this.generateAgentReferralCode();

    const agent = await this.prisma.agent.create({
      data: {
        fullName: dto.fullName.trim(),
        phoneNumber: dto.phoneNumber.trim(),
        passwordHash,
        commission: dto.commission ?? 0,
        accountLimit: dto.accountLimit ?? 0,
        type: dto.type ?? 'personal',
        referralCode,
        paymentAccounts: dto.paymentAccounts?.length
          ? {
              create: dto.paymentAccounts.map((p) => ({
                method: p.method,
                label: p.label.trim(),
                accountNumber: p.accountNumber.trim(),
                accountName: p.accountName?.trim() || null,
                details: p.details?.trim() || null,
              })),
            }
          : undefined,
      },
      include: { paymentAccounts: true },
    });
    return this.toAdmin(agent);
  }

  async update(id: string, dto: UpdateAgentDto) {
    const existing = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Agent not found.');
    }

    if (dto.phoneNumber && dto.phoneNumber.trim() !== existing.phoneNumber) {
      const clash = await this.prisma.agent.findUnique({
        where: { phoneNumber: dto.phoneNumber.trim() },
      });
      if (clash) {
        throw new ConflictException(
          'An agent with this phone number already exists.',
        );
      }
    }

    const agent = await this.prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
        ...(dto.phoneNumber !== undefined && {
          phoneNumber: dto.phoneNumber.trim(),
        }),
        ...(dto.password && {
          passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
        }),
        ...(dto.commission !== undefined && { commission: dto.commission }),
        ...(dto.accountLimit !== undefined && {
          accountLimit: dto.accountLimit,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.type !== undefined && { type: dto.type }),
      },
      include: { paymentAccounts: true },
    });
    return this.toAdmin(agent);
  }

  async remove(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    await this.prisma.agent.delete({ where: { id: agent.id } });
    return { success: true };
  }

  async login(dto: AgentLoginDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { phoneNumber: dto.phoneNumber },
      include: { paymentAccounts: true },
    });
    if (!agent || !agent.passwordHash) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }
    const matches = await bcrypt.compare(dto.password, agent.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }
    if (!agent.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact an admin.',
      );
    }
    return this.toAdmin(agent);
  }

  async changePassword(id: string, dto: AgentChangePasswordDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    if (!agent.passwordHash) {
      throw new UnauthorizedException(
        'No password has been set for this account yet. Contact an admin.',
      );
    }
    const matches = await bcrypt.compare(dto.oldPassword, agent.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { passwordHash },
    });
    return { success: true };
  }

  /**
   * Resolves a signup-time agent code (?agent=CODE) against a real, active
   * agent and links the new user to them. Called from AuthService.register
   * right after the user row is created — never throws, a broken/unknown
   * code must not block registration (same tolerance as
   * ReferralService.linkReferral for the player-to-player code).
   */
  async linkAgentReferral(
    newUserId: bigint,
    enteredCode: string | null | undefined,
  ): Promise<void> {
    const trimmed = enteredCode?.trim().toUpperCase();
    if (!trimmed) return;

    try {
      const agent = await this.prisma.agent.findUnique({
        where: { referralCode: trimmed },
      });
      if (!agent || !agent.isActive) return;

      await this.prisma.user.update({
        where: { id: newUserId },
        data: { referredByAgentId: agent.id },
      });
    } catch (err) {
      this.logger.error(
        `Failed to link agent referral for user ${newUserId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Pays the referring agent a cut of a referred player's NET LOSS on this
   * one bet (betAmount - winAmount, only when positive) — never on deposit
   * volume, never on a win. Only 'commission'-type agents actually earn
   * this; 'personal' agents still get preferential payment-account routing
   * (see PaymentAccountsService/TransactionsService) but no automatic
   * payout. Called from GamesService.handleCallback right after the bet's
   * balance update commits, same spot ReferralService.recordBetCommission
   * hooks in from. Never throws — a commission failure must not affect the
   * bet/win response the player is waiting on.
   */
  async recordLossCommission(
    playerUserId: bigint,
    betAmount: Prisma.Decimal,
    winAmount: Prisma.Decimal,
    gameTransactionId: bigint,
  ): Promise<void> {
    const lossAmount = betAmount.sub(winAmount);
    if (lossAmount.lessThanOrEqualTo(0)) return;

    try {
      const player = await this.prisma.user.findUnique({
        where: { id: playerUserId },
        select: { referredByAgentId: true },
      });
      if (!player?.referredByAgentId) return;

      const agent = await this.prisma.agent.findUnique({
        where: { id: player.referredByAgentId },
      });
      if (!agent || !agent.isActive || agent.type !== 'commission') return;
      if (agent.commission.lessThanOrEqualTo(0)) return;

      const commissionAmount = lossAmount.mul(agent.commission).div(100);
      if (commissionAmount.lessThanOrEqualTo(0)) return;

      // Dedup via the unique constraint on sourceGameTransactionId — a
      // retried/concurrent callback for the same bet hits this and is
      // caught below, never recorded twice. No balance to credit here (an
      // Agent has no in-platform wallet, unlike a referring player) — this
      // is a reporting-only ledger the agent/CRM read from, see
      // getReferredPlayerStats.
      await this.prisma.agentCommission.create({
        data: {
          agentId: agent.id,
          playerId: playerUserId,
          sourceGameTransactionId: gameTransactionId,
          lossAmount,
          commissionRate: agent.commission,
          commissionAmount,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.log(
          `Agent commission for game transaction ${gameTransactionId} already recorded — skipped duplicate.`,
        );
        return;
      }
      this.logger.error(
        `Agent commission failed for player ${playerUserId}: ${(err as Error).message}`,
      );
    }
  }

  // Turns a period selector into a concrete [from, to) range, computed
  // against Bangladesh Standard Time (UTC+6, no DST — this platform's only
  // timezone) rather than UTC or the server's own local time. Using raw UTC
  // here would make "today" flip over 6 hours early for a Dhaka-based staff
  // member (e.g. still showing yesterday's empty totals at 2am local time).
  // 'day' defaults to today but accepts an explicit YYYY-MM-DD (interpreted
  // as a Dhaka calendar date); 'week' is Monday-through-now of the current
  // week; 'month' is the 1st-through-now of the current month, all in
  // Dhaka time. No period at all means all-time (undefined).
  private resolvePeriodRange(
    period?: 'day' | 'week' | 'month',
    date?: string,
  ): { from: Date; to: Date } | undefined {
    if (!period) return undefined;

    const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
    const now = new Date();
    // Shifting by the offset then reading UTC Y/M/D off the shifted instant
    // yields the Dhaka calendar date — then shifting back gives the real
    // UTC instant for Dhaka midnight on that date.
    const dhakaDateStr = (instant: Date) =>
      new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
    const dhakaMidnightUtc = (dateStr: string) =>
      new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - DHAKA_OFFSET_MS);

    if (period === 'day') {
      const from = dhakaMidnightUtc(date ?? dhakaDateStr(now));
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 1);
      return { from, to };
    }

    if (period === 'week') {
      const todayStr = dhakaDateStr(now);
      const todayUtcMidnight = new Date(`${todayStr}T00:00:00.000Z`);
      // getUTCDay(): 0=Sun..6=Sat — roll back to the most recent Monday.
      const day = todayUtcMidnight.getUTCDay();
      todayUtcMidnight.setUTCDate(todayUtcMidnight.getUTCDate() - (day === 0 ? 6 : day - 1));
      const from = dhakaMidnightUtc(todayUtcMidnight.toISOString().slice(0, 10));
      return { from, to: now };
    }

    // month
    const [y, m] = dhakaDateStr(now).split('-');
    const from = dhakaMidnightUtc(`${y}-${m}-01`);
    return { from, to: now };
  }

  /**
   * Referred-player breakdown for an agent's own dashboard (and the CRM's
   * agent-detail view): per player, their deposit/withdraw/wagered/won/loss
   * totals, plus the agent's total commission earned from them. Batched
   * aggregates (one groupBy per metric) instead of one query per player.
   *
   * `range`, when given, restricts every figure (deposits, withdrawals,
   * bets, commission) to transactions created within [from, to) — the
   * player list itself (who this agent has referred, ever) is not
   * filtered, so a player with no activity in the period just shows zeros
   * rather than disappearing.
   */
  async getReferredPlayerStats(
    agentId: string,
    period?: 'day' | 'week' | 'month',
    date?: string,
  ) {
    const id = BigInt(agentId);
    const range = this.resolvePeriodRange(period, date);
    const [agent, players] = await Promise.all([
      this.prisma.agent.findUnique({ where: { id }, select: { commission: true } }),
      this.prisma.user.findMany({
        where: { referredByAgentId: id },
        select: { id: true, fullName: true, memberId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (players.length === 0) {
      return {
        players: [],
        totals: { deposit: 0, withdraw: 0, wagered: 0, won: 0, loss: 0, commission: 0 },
      };
    }
    const commissionRate = Number(agent?.commission ?? 0);
    const playerIds = players.map((p) => p.id);
    const dateFilter = range
      ? { createdAt: { gte: range.from, lt: range.to } }
      : {};

    const [deposits, withdrawals, bets] = await Promise.all([
      this.prisma.cashTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: playerIds }, type: 'cash_in', status: 'completed', ...dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.cashTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: playerIds }, type: 'cash_out', status: 'completed', ...dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.gameTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: playerIds }, ...dateFilter },
        _sum: { betAmount: true, winAmount: true },
      }),
    ]);

    const depositByUser = new Map(deposits.map((d) => [d.userId.toString(), Number(d._sum.amount ?? 0)]));
    const withdrawByUser = new Map(withdrawals.map((w) => [w.userId.toString(), Number(w._sum.amount ?? 0)]));
    const wageredByUser = new Map(bets.map((b) => [b.userId.toString(), Number(b._sum.betAmount ?? 0)]));
    const wonByUser = new Map(bets.map((b) => [b.userId.toString(), Number(b._sum.winAmount ?? 0)]));

    const rows = players.map((p) => {
      const key = p.id.toString();
      const wagered = wageredByUser.get(key) ?? 0;
      const won = wonByUser.get(key) ?? 0;
      const loss = Math.max(0, wagered - won);
      const deposit = depositByUser.get(key) ?? 0;
      // Commission is capped at what the player has actually deposited —
      // Total Loss can run past that (e.g. wagering wins back into more
      // bets), but the agent's cut never exceeds deposit * rate. Total Loss
      // itself is shown uncapped, unchanged, for transparency.
      const commissionBasis = Math.min(loss, deposit);
      return {
        id: key,
        fullName: p.fullName,
        memberId: p.memberId,
        joinedAt: p.createdAt.toISOString(),
        deposit,
        withdraw: withdrawByUser.get(key) ?? 0,
        wagered,
        won,
        loss,
        commission: (commissionBasis * commissionRate) / 100,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        deposit: acc.deposit + r.deposit,
        withdraw: acc.withdraw + r.withdraw,
        wagered: acc.wagered + r.wagered,
        won: acc.won + r.won,
        loss: acc.loss + r.loss,
        commission: acc.commission + r.commission,
      }),
      { deposit: 0, withdraw: 0, wagered: 0, won: 0, loss: 0, commission: 0 },
    );

    return { players: rows, totals };
  }

  /**
   * Commission wallet summary. Earned total is summed straight from the
   * AgentCommission ledger — NOT from getReferredPlayerStats' live,
   * deposit-capped recalculation. That figure is fine for a "current
   * standing" display, but it can shrink in real time (a referred player
   * winning back their losses reduces net loss, and therefore the
   * recomputed commission, right under an agent's feet) — wrong for money
   * that's about to be settled/paid, which must only ever grow until it's
   * actually paid out. The ledger is written once per losing bet and never
   * revised, so it's the stable source settlement math needs.
   */
  async getWalletSummary(agentId: string) {
    const id = BigInt(agentId);
    const [commissionTotal, settlements] = await Promise.all([
      this.prisma.agentCommission.aggregate({
        where: { agentId: id },
        _sum: { commissionAmount: true },
      }),
      this.prisma.agentSettlement.groupBy({
        by: ['status'],
        where: { agentId: id, status: { in: ['completed', 'pending'] } },
        _sum: { amount: true },
      }),
    ]);

    const totalEarnedCommission = Number(commissionTotal._sum.commissionAmount ?? 0);
    const totalSettled = Number(
      settlements.find((s) => s.status === 'completed')?._sum.amount ?? 0,
    );
    const pendingAmount = Number(
      settlements.find((s) => s.status === 'pending')?._sum.amount ?? 0,
    );
    const walletBalance = Math.max(0, totalEarnedCommission - totalSettled);
    const requestableBalance = Math.max(0, walletBalance - pendingAmount);

    return { totalEarnedCommission, totalSettled, pendingAmount, walletBalance, requestableBalance };
  }

  /** Agent-initiated: request payout of some or all of their requestable balance. */
  async requestSettlement(agentId: string, amount: number, note?: string) {
    if (amount <= 0) {
      throw new BadRequestException('Settlement amount must be greater than zero.');
    }
    const summary = await this.getWalletSummary(agentId);
    if (amount > summary.requestableBalance) {
      throw new BadRequestException(
        `You can request at most ৳${summary.requestableBalance.toFixed(2)} right now.`,
      );
    }

    return this.prisma.agentSettlement.create({
      data: {
        agentId: BigInt(agentId),
        amount: new Prisma.Decimal(amount),
        note: note?.trim() || null,
      },
    });
  }

  /** Staff-initiated: confirm a pending settlement request as paid. */
  async confirmSettlement(settlementId: string, confirmedByUsername: string) {
    return this.resolveSettlement(settlementId, confirmedByUsername, 'completed');
  }

  /** Staff-initiated: decline a pending settlement request (e.g. a mistake/duplicate). */
  async rejectSettlement(settlementId: string, confirmedByUsername: string) {
    return this.resolveSettlement(settlementId, confirmedByUsername, 'rejected');
  }

  private async resolveSettlement(
    settlementId: string,
    confirmedByUsername: string,
    status: 'completed' | 'rejected',
  ) {
    const settlement = await this.prisma.agentSettlement.findUnique({
      where: { id: BigInt(settlementId) },
    });
    if (!settlement) {
      throw new NotFoundException('Settlement request not found.');
    }
    if (settlement.status !== 'pending') {
      throw new ConflictException('This settlement request has already been resolved.');
    }
    const confirmer = await this.prisma.account.findUnique({
      where: { username: confirmedByUsername },
    });
    if (!confirmer) {
      throw new NotFoundException('Reviewer account not found.');
    }

    return this.prisma.agentSettlement.update({
      where: { id: settlement.id },
      data: { status, confirmedBy: confirmer.id, confirmedAt: new Date() },
    });
  }

  async getSettlementHistory(agentId: string) {
    const settlements = await this.prisma.agentSettlement.findMany({
      where: { agentId: BigInt(agentId) },
      include: { confirmer: { select: { username: true } } },
      orderBy: { requestedAt: 'desc' },
    });

    return settlements.map((s) => ({
      id: s.id.toString(),
      amount: s.amount.toString(),
      status: s.status,
      note: s.note,
      requestedAt: s.requestedAt.toISOString(),
      confirmedByUsername: s.confirmer?.username ?? null,
      confirmedAt: s.confirmedAt?.toISOString() ?? null,
    }));
  }
}
