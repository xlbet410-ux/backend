import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';
import { ResolveCashTransactionDto } from './dto/resolve-cash-transaction.dto';

type AgentAccount = { label: string; accountNumber: string } | null;

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
  paymentAccount: true,
} as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private toAdmin(row: CashTransactionRow) {
    return {
      id: row.id.toString(),
      player: row.user.fullName,
      method: row.method,
      reference: row.reference,
      amount: Number(row.amount),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      reviewedBy: row.reviewer?.username ?? null,
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
    const reviewer = await this.prisma.account.findUnique({
      where: { username: dto.reviewerUsername },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer account not found.');
    }

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
          reviewedBy: reviewer.id,
          reviewedAt: new Date(),
        },
      });
    });
    return { success: true };
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
    const reviewer = await this.prisma.account.findUnique({
      where: { username: dto.reviewerUsername },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer account not found.');
    }

    await this.prisma.cashTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'failed',
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
      },
    });
    return { success: true };
  }
}
