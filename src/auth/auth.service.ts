import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async generateOwnReferralCode(): Promise<string> {
    for (;;) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const existing = await this.prisma.user.findUnique({ where: { ownReferralCode: code } });
      if (!existing) return code;
    }
  }

  private toPublicUser(user: {
    id: bigint;
    fullName: string;
    phoneNumber: string;
    ownReferralCode: string | null;
    balance: Prisma.Decimal;
  }) {
    return {
      id: user.id.toString(),
      name: user.fullName,
      phone: user.phoneNumber,
      referralCode: user.ownReferralCode,
      balance: `৳${Number(user.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { phoneNumber: dto.phoneNumber } });
    if (existing) {
      throw new ConflictException('This phone number is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const ownReferralCode = await this.generateOwnReferralCode();

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        referralCode: dto.referralCode || null,
        ownReferralCode,
        isAdult: dto.isAdult ?? dto.agreedTerms,
        agreedTerms: dto.agreedTerms,
      },
    });

    const token = await this.jwt.signAsync({ sub: user.id.toString(), phone: user.phoneNumber });
    return { token, user: this.toPublicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { phoneNumber: dto.phoneNumber } });
    if (!user) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }

    const token = await this.jwt.signAsync({ sub: user.id.toString(), phone: user.phoneNumber });
    return { token, user: this.toPublicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toPublicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const matches = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { success: true };
  }
}
