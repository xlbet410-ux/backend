import { Injectable } from '@nestjs/common';
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
}
