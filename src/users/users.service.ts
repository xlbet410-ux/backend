import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'desc' },
      include: {
        kycVerification: true,
        cashTransactions: {
          where: { status: 'completed' },
          select: { type: true, amount: true },
        },
      },
    });
    return users.map((u) => {
      let totalCashIn = 0;
      let totalCashOut = 0;
      for (const tx of u.cashTransactions) {
        if (tx.type === 'cash_in') totalCashIn += Number(tx.amount);
        else totalCashOut += Number(tx.amount);
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
        kycStatus: u.kycVerification?.status ?? 'none',
        totalCashIn,
        totalCashOut,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      };
    });
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

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    // Conversations, KYC verification, and game transactions all cascade
    // (onDelete: Cascade in schema.prisma) — no manual cleanup needed.
    await this.prisma.user.delete({ where: { id: user.id } });
    return { success: true };
  }
}
