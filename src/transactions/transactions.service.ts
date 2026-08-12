import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';
import { ResolveCashTransactionDto } from './dto/resolve-cash-transaction.dto';
import { OffersService } from '../offers/offers.service';
import { BonusService } from '../bonus/bonus.service';
import { VipService } from '../vip/vip.service';
import { Prisma } from '../../generated/prisma/client';

type AgentAccount = {
  label: string;
  accountNumber: string;
  agentId: bigint;
} | null;

type CashTransactionRow = {
  id: bigint;
  type: string;
  method: string;
  amount: unknown;
  reference: string | null;
  status: string;
  createdAt: Date;
  user: { fullName: string };
  reviewer: { username: string } | null;
  approvingAgent: { fullName: string } | null;
  paymentAccount: AgentAccount;
};

type MyCashTransactionRow = {
  id: bigint;
  type: string;
  method: string;
  amount: unknown;
  reference: string | null;
  status: string;
  createdAt: Date;
  paymentAccount: AgentAccount;
};

const ADMIN_INCLUDE = {
  user: true,
  reviewer: true,
  approvingAgent: true,
  paymentAccount: true,
} as const;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
    private readonly bonusService: BonusService,
    private readonly vipService: VipService,
  ) {}

  private toAdmin(row: CashTransactionRow) {
    return {
      id: row.id.toString(),
      type: row.type,
      player: row.user.fullName,
      method: row.method,
      reference: row.reference,
      amount: Number(row.amount),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      reviewedBy: row.reviewer?.username ?? null,
      approvedByAgentName: row.approvingAgent?.fullName ?? null,
      agentLabel: row.paymentAccount?.label ?? null,
      agentAccountNumber: row.paymentAccount?.accountNumber ?? null,
    };
  }

  private toMine(row: MyCashTransactionRow) {
    return {
      id: row.id.toString(),
      type: row.type,
      method: row.method,
      reference: row.reference,
      amount: Number(row.amount),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      agentLabel: row.paymentAccount?.label ?? null,
      agentAccountNumber: row.paymentAccount?.accountNumber ?? null,
    };
  }

  // Resolves which agent payment account a request is tied to. A cash-in
  // passes the exact account it showed the player (requestedId) so the
  // record matches what they actually saw; a cash-out never has one to
  // pass (the player picks no account when withdrawing) and always falls
  // back to the first active account for the method.
  private async resolvePaymentAccountId(
    method: string,
    requestedId?: string,
  ): Promise<bigint | null> {
    if (requestedId) {
      const account = await this.prisma.paymentAccount.findUnique({
        where: { id: BigInt(requestedId) },
      });
      if (account && account.method === method) return account.id;
    }
    const fallback = await this.prisma.paymentAccount.findFirst({
      where: { method, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return fallback?.id ?? null;
  }

  // A player's own deposit + withdrawal history, both types merged into one
  // feed newest-first — the CRM's admin lists (findCashIn/findCashOut) stay
  // split by type since staff review each queue separately.
  async findMine(userId: string) {
    const rows = await this.prisma.cashTransaction.findMany({
      where: { userId: BigInt(userId) },
      include: { paymentAccount: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toMine(r));
  }

  // An agent's own deposit + withdrawal requests — only ones tied to a
  // payment account they own, both types merged newest-first (mirrors
  // findMine for players).
  async findByAgent(agentId: string) {
    const rows = await this.prisma.cashTransaction.findMany({
      where: { paymentAccount: { agentId: BigInt(agentId) } },
      include: ADMIN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAdmin(r));
  }

  async findCashIn() {
    const rows = await this.prisma.cashTransaction.findMany({
      where: { type: 'cash_in' },
      include: ADMIN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAdmin(r));
  }

  async findCashOut() {
    const rows = await this.prisma.cashTransaction.findMany({
      where: { type: 'cash_out' },
      include: ADMIN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAdmin(r));
  }

  // Cash-in has no KYC/active gate — a brand new, unverified player can
  // still deposit; it's only withdrawals that require verification.
  async createCashIn(userId: string, dto: CreateCashTransactionDto) {
    const paymentAccountId = await this.resolvePaymentAccountId(
      dto.method,
      dto.paymentAccountId,
    );
    const tx = await this.prisma.cashTransaction.create({
      data: {
        userId: BigInt(userId),
        type: 'cash_in',
        method: dto.method,
        amount: dto.amount,
        reference: dto.reference.trim(),
        paymentAccountId,
        offerId: dto.offerId ? BigInt(dto.offerId) : null,
      },
      include: ADMIN_INCLUDE,
    });
    return this.toAdmin(tx);
  }

  async createCashOut(userId: string, dto: CreateCashTransactionDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { kycVerification: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account has been deactivated. Contact support for help.',
      );
    }
    if (user.kycVerification?.status !== 'verified') {
      throw new ForbiddenException(
        'Complete KYC verification before requesting a withdrawal.',
      );
    }
    const canWithdraw = await this.bonusService.canWithdraw(user.id);
    if (!canWithdraw.allowed) {
      throw new ForbiddenException(canWithdraw.reason);
    }
    if (Number(user.balance) < dto.amount) {
      throw new ConflictException(
        'Withdrawal amount exceeds your available balance.',
      );
    }

    const paymentAccountId = await this.resolvePaymentAccountId(dto.method);
    const tx = await this.prisma.cashTransaction.create({
      data: {
        userId: user.id,
        type: 'cash_out',
        method: dto.method,
        amount: dto.amount,
        reference: dto.reference.trim(),
        paymentAccountId,
      },
      include: ADMIN_INCLUDE,
    });
    return this.toAdmin(tx);
  }

  // Looks up whoever is resolving this request — a staff Account by
  // username, or an Agent by id who must own the transaction's payment
  // account. Throws if neither identity checks out.
  private async resolveApprover(
    tx: { paymentAccountId: bigint | null },
    dto: ResolveCashTransactionDto,
  ): Promise<{ reviewedBy?: bigint; approvedByAgentId?: bigint }> {
    if (dto.agentId) {
      if (!tx.paymentAccountId) {
        throw new ForbiddenException(
          'This request has no agent account attached to approve against.',
        );
      }
      const account = await this.prisma.paymentAccount.findUnique({
        where: { id: tx.paymentAccountId },
      });
      if (!account || account.agentId !== BigInt(dto.agentId)) {
        throw new ForbiddenException(
          'This request is not tied to your agent account.',
        );
      }
      return { approvedByAgentId: BigInt(dto.agentId) };
    }
    if (dto.reviewerUsername) {
      const reviewer = await this.prisma.account.findUnique({
        where: { username: dto.reviewerUsername },
      });
      if (!reviewer) {
        throw new NotFoundException('Reviewer account not found.');
      }
      return { reviewedBy: reviewer.id };
    }
    throw new BadRequestException(
      'Either reviewerUsername or agentId is required.',
    );
  }

  async approve(id: string, dto: ResolveCashTransactionDto) {
    const tx = await this.prisma.cashTransaction.findUnique({
      where: { id: BigInt(id) },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found.');
    }
    if (tx.status !== 'pending') {
      throw new ConflictException(
        'This transaction has already been resolved.',
      );
    }
    const approver = await this.resolveApprover(tx, dto);

    await this.prisma.$transaction(async (db) => {
      if (tx.type === 'cash_in') {
        await db.user.update({
          where: { id: tx.userId },
          data: { balance: { increment: tx.amount } },
        });
      } else {
        const user = await db.user.findUniqueOrThrow({
          where: { id: tx.userId },
        });
        if (Number(user.balance) < Number(tx.amount)) {
          throw new ConflictException(
            "Player's balance is no longer sufficient for this withdrawal.",
          );
        }
        await db.user.update({
          where: { id: tx.userId },
          data: { balance: { decrement: tx.amount } },
        });
      }
      await db.cashTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'completed',
          reviewedAt: new Date(),
          ...approver,
        },
      });
    });

    // Offer triggers run after the approval itself has committed, and never
    // undo it — a bug in bonus-awarding must never block or roll back an
    // otherwise-valid deposit/withdrawal approval.
    if (tx.type === 'cash_in') {
      await this.fireDepositTriggers(tx.userId, tx.amount, tx.offerId);

      try {
        await this.vipService.recordDeposit(tx.userId, tx.amount);
      } catch (err) {
        this.logger.error(
          `VIP deposit tracking failed for user ${tx.userId}: ${(err as Error).message}`,
        );
      }
    }

    return { success: true };
  }

  private async fireDepositTriggers(
    userId: bigint,
    amount: Prisma.Decimal,
    offerId: bigint | null,
  ) {
    try {
      const depositCount = await this.prisma.cashTransaction.count({
        where: { userId, type: 'cash_in', status: 'completed' },
      });

      if (depositCount === 1) {
        await this.offersService.processTrigger(
          { type: 'first_deposit', userId, amount },
          offerId ?? undefined,
        );
      } else {
        await this.offersService.processTrigger(
          { type: 'nth_deposit', userId, amount, depositCount },
          offerId ?? undefined,
        );
      }
      await this.offersService.processTrigger(
        { type: 'every_deposit', userId, amount },
        offerId ?? undefined,
      );
    } catch (err) {
      // Never let a broken offer definition break a real deposit approval.
      this.logger.error(
        `Offer trigger failed for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  async reject(id: string, dto: ResolveCashTransactionDto) {
    const tx = await this.prisma.cashTransaction.findUnique({
      where: { id: BigInt(id) },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found.');
    }
    if (tx.status !== 'pending') {
      throw new ConflictException(
        'This transaction has already been resolved.',
      );
    }
    const approver = await this.resolveApprover(tx, dto);

    await this.prisma.cashTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'failed',
        reviewedAt: new Date(),
        ...approver,
      },
    });
    return { success: true };
  }
}
