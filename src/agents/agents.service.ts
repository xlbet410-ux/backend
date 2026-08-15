import {
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

  /**
   * Referred-player breakdown for an agent's own dashboard (and the CRM's
   * agent-detail view): per player, their deposit/withdraw/wagered/loss
   * totals, plus the agent's total commission earned from them. Batched
   * aggregates (one groupBy per metric) instead of one query per player.
   */
  async getReferredPlayerStats(agentId: string) {
    const id = BigInt(agentId);
    const players = await this.prisma.user.findMany({
      where: { referredByAgentId: id },
      select: { id: true, fullName: true, memberId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (players.length === 0) {
      return { players: [], totals: { deposit: 0, withdraw: 0, wagered: 0, loss: 0, commission: 0 } };
    }
    const playerIds = players.map((p) => p.id);

    const [deposits, withdrawals, bets, commissions] = await Promise.all([
      this.prisma.cashTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: playerIds }, type: 'cash_in', status: 'completed' },
        _sum: { amount: true },
      }),
      this.prisma.cashTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: playerIds }, type: 'cash_out', status: 'completed' },
        _sum: { amount: true },
      }),
      this.prisma.gameTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: playerIds } },
        _sum: { betAmount: true },
      }),
      // Same source table recordLossCommission writes to — loss and
      // commission are reported from the exact figures commission was
      // actually computed and paid on, so the two numbers always agree
      // (a naive wagered-minus-won net across all bets would drift from
      // the per-bet-loss basis commission is paid on whenever a player has
      // both winning and losing bets in the period).
      this.prisma.agentCommission.groupBy({
        by: ['playerId'],
        where: { agentId: id },
        _sum: { lossAmount: true, commissionAmount: true },
      }),
    ]);

    const depositByUser = new Map(deposits.map((d) => [d.userId.toString(), Number(d._sum.amount ?? 0)]));
    const withdrawByUser = new Map(withdrawals.map((w) => [w.userId.toString(), Number(w._sum.amount ?? 0)]));
    const wageredByUser = new Map(bets.map((b) => [b.userId.toString(), Number(b._sum.betAmount ?? 0)]));
    const lossByUser = new Map(commissions.map((c) => [c.playerId.toString(), Number(c._sum.lossAmount ?? 0)]));
    const commissionByUser = new Map(
      commissions.map((c) => [c.playerId.toString(), Number(c._sum.commissionAmount ?? 0)]),
    );

    const rows = players.map((p) => {
      const key = p.id.toString();
      return {
        id: key,
        fullName: p.fullName,
        memberId: p.memberId,
        joinedAt: p.createdAt.toISOString(),
        deposit: depositByUser.get(key) ?? 0,
        withdraw: withdrawByUser.get(key) ?? 0,
        wagered: wageredByUser.get(key) ?? 0,
        loss: lossByUser.get(key) ?? 0,
        commission: commissionByUser.get(key) ?? 0,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        deposit: acc.deposit + r.deposit,
        withdraw: acc.withdraw + r.withdraw,
        wagered: acc.wagered + r.wagered,
        loss: acc.loss + r.loss,
        commission: acc.commission + r.commission,
      }),
      { deposit: 0, withdraw: 0, wagered: 0, loss: 0, commission: 0 },
    );

    return { players: rows, totals };
  }
}
