import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';

@Injectable()
export class PaymentAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(account: {
    id: bigint;
    method: string;
    label: string;
    accountNumber: string;
    accountName: string | null;
    details: string | null;
    isActive: boolean;
    createdAt: Date;
  }) {
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
    return accounts.map((a) => this.toPublic(a));
  }

  async create(dto: CreatePaymentAccountDto) {
    const account = await this.prisma.paymentAccount.create({
      data: {
        method: dto.method,
        label: dto.label.trim(),
        accountNumber: dto.accountNumber.trim(),
        accountName: dto.accountName?.trim() || null,
        details: dto.details?.trim() || null,
      },
    });
    return this.toPublic(account);
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
