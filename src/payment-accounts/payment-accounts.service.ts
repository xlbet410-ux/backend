import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';
import { UpdatePaymentAccountDto } from './dto/update-payment-account.dto';

const SALT_ROUNDS = 10;

type PaymentAccountRow = {
  id: bigint;
  method: string;
  label: string;
  accountNumber: string;
  accountName: string | null;
  details: string | null;
  commission: unknown;
  accountLimit: unknown;
  monthlyEarn: unknown;
  monthlyCollect: unknown;
  isActive: boolean;
  createdAt: Date;
};

@Injectable()
export class PaymentAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  // Full admin view — everything the CRM's Agent panel shows, but still
  // never the password hash (write-only, never read back).
  private toAdmin(account: PaymentAccountRow) {
    return {
      id: account.id.toString(),
      method: account.method,
      label: account.label,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      details: account.details,
      commission: Number(account.commission),
      accountLimit: Number(account.accountLimit),
      monthlyEarn: Number(account.monthlyEarn),
      monthlyCollect: Number(account.monthlyCollect),
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
    };
  }

  // Public view — what the bet site's Deposit/Withdraw page reads with no
  // auth, so it's deliberately stripped down to just what a depositing
  // player needs to see (no commission, limits, or earnings figures).
  private toPublicActive(account: PaymentAccountRow) {
    return {
      id: account.id.toString(),
      method: account.method,
      label: account.label,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      details: account.details,
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
    };
  }

  async findAll() {
    const accounts = await this.prisma.paymentAccount.findMany({
      orderBy: [{ method: 'asc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => this.toAdmin(a));
  }

  async findAllActive() {
    const accounts = await this.prisma.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: [{ method: 'asc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => this.toPublicActive(a));
  }

  async create(dto: CreatePaymentAccountDto) {
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, SALT_ROUNDS)
      : null;
    const account = await this.prisma.paymentAccount.create({
      data: {
        method: dto.method,
        label: dto.label.trim(),
        accountNumber: dto.accountNumber.trim(),
        accountName: dto.accountName?.trim() || null,
        details: dto.details?.trim() || null,
        passwordHash,
        commission: dto.commission ?? 0,
        accountLimit: dto.accountLimit ?? 0,
        monthlyEarn: dto.monthlyEarn ?? 0,
        monthlyCollect: dto.monthlyCollect ?? 0,
      },
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
        ...(dto.password && {
          passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
        }),
        ...(dto.commission !== undefined && { commission: dto.commission }),
        ...(dto.accountLimit !== undefined && {
          accountLimit: dto.accountLimit,
        }),
        ...(dto.monthlyEarn !== undefined && { monthlyEarn: dto.monthlyEarn }),
        ...(dto.monthlyCollect !== undefined && {
          monthlyCollect: dto.monthlyCollect,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
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
