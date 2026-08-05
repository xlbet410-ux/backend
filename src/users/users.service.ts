import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { id: 'desc' } });
    return users.map((u) => ({
      id: u.id.toString(),
      fullName: u.fullName,
      phoneNumber: u.phoneNumber,
      referralCode: u.referralCode,
      ownReferralCode: u.ownReferralCode,
      isAdult: u.isAdult,
      agreedTerms: u.agreedTerms,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));
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
