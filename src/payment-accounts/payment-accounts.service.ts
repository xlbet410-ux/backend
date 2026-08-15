import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';
import { UpdatePaymentAccountDto } from './dto/update-payment-account.dto';

type PaymentAccountRow = {
  id: bigint;
  agentId: bigint;
  method: string;
  label: string;
  accountNumber: string;
  accountName: string | null;
  details: string | null;
  isActive: boolean;
  createdAt: Date;
};

type AdminPaymentAccountRow = PaymentAccountRow & {
  agentId: bigint;
  agent: { fullName: string };
};

@Injectable()
export class PaymentAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  // Admin view — includes which agent this number belongs to. Commission,
  // limits, and earnings now live on the Agent itself (see AgentsService),
  // not on the individual number.
  private toAdmin(account: AdminPaymentAccountRow) {
    return {
      id: account.id.toString(),
      agentId: account.agentId.toString(),
      agentFullName: account.agent.fullName,
      method: account.method,
      label: account.label,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      details: account.details,
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
    };
  }

  // Public view — what the bet site's Deposit/Withdraw page reads with no
  // auth, so it's deliberately stripped down to just what a depositing
  // player needs to see. isMyAgent tells the frontend to always show this
  // one for a referred player instead of shuffling it in with the shared
  // pool — see findAllActiveForUser.
  private toPublicActive(account: PaymentAccountRow, isMyAgent = false) {
    return {
      id: account.id.toString(),
      method: account.method,
      label: account.label,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      details: account.details,
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
      isMyAgent,
    };
  }

  async findAll() {
    const accounts = await this.prisma.paymentAccount.findMany({
      include: { agent: true },
      orderBy: [{ method: 'asc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => this.toAdmin(a));
  }

  // Public, unauthenticated view — no player identity to check against, so
  // 'commission'-type agents' numbers (which are exclusive to their own
  // referred players) are always excluded here. See findAllActiveForUser
  // for the authenticated equivalent used by logged-in players.
  async findAllActive() {
    const accounts = await this.prisma.paymentAccount.findMany({
      where: { isActive: true, agent: { type: { not: 'commission' } } },
      orderBy: [{ method: 'asc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => this.toPublicActive(a));
  }

  // Authenticated view for a logged-in player: the shared 'personal' pool,
  // plus — if this player was referred by any agent — that one agent's own
  // numbers, flagged isMyAgent so the frontend always shows that specific
  // account instead of shuffling it in with the shared pool (a
  // 'commission'-type agent's numbers are otherwise hidden from everyone
  // else; a 'personal' agent's numbers were already in the shared pool, but
  // still get flagged so their own referred player sees them consistently
  // rather than at random).
  async findAllActiveForUser(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referredByAgentId: true },
    });

    const accounts = await this.prisma.paymentAccount.findMany({
      where: {
        isActive: true,
        OR: [
          { agent: { type: { not: 'commission' } } },
          ...(user?.referredByAgentId
            ? [{ agentId: user.referredByAgentId }]
            : []),
        ],
      },
      orderBy: [{ method: 'asc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) =>
      this.toPublicActive(
        a,
        user?.referredByAgentId != null && a.agentId === user.referredByAgentId,
      ),
    );
  }

  async create(dto: CreatePaymentAccountDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(dto.agentId) },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    const account = await this.prisma.paymentAccount.create({
      data: {
        agentId: agent.id,
        method: dto.method,
        label: dto.label.trim(),
        accountNumber: dto.accountNumber.trim(),
        accountName: dto.accountName?.trim() || null,
        details: dto.details?.trim() || null,
      },
      include: { agent: true },
    });
    return this.toAdmin(account);
  }

  async update(id: string, dto: UpdatePaymentAccountDto) {
    const existing = await this.prisma.paymentAccount.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Payment account not found.');
    }

    const account = await this.prisma.paymentAccount.update({
      where: { id: existing.id },
      data: {
        ...(dto.label !== undefined && { label: dto.label.trim() }),
        ...(dto.accountNumber !== undefined && {
          accountNumber: dto.accountNumber.trim(),
        }),
        ...(dto.accountName !== undefined && {
          accountName: dto.accountName.trim() || null,
        }),
        ...(dto.details !== undefined && {
          details: dto.details.trim() || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { agent: true },
    });
    return this.toAdmin(account);
  }

  async setActive(id: string, isActive: boolean) {
    const account = await this.prisma.paymentAccount.findUnique({
      where: { id: BigInt(id) },
    });
    if (!account) {
      throw new NotFoundException('Payment account not found.');
    }
    await this.prisma.paymentAccount.update({
      where: { id: account.id },
      data: { isActive },
    });
    return { success: true };
  }

  async remove(id: string) {
    const account = await this.prisma.paymentAccount.findUnique({
      where: { id: BigInt(id) },
    });
    if (!account) {
      throw new NotFoundException('Payment account not found.');
    }
    await this.prisma.paymentAccount.delete({ where: { id: account.id } });
    return { success: true };
  }
}
