import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OffersService } from '../offers/offers.service';
import { ReferralService } from '../referral/referral.service';
import { LoginStreakService } from '../login-streak/login-streak.service';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly offersService: OffersService,
    private readonly referralService: ReferralService,
    private readonly loginStreakService: LoginStreakService,
  ) {}

  private async generateOwnReferralCode(): Promise<string> {
    for (;;) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const existing = await this.prisma.user.findUnique({
        where: { ownReferralCode: code },
      });
      if (!existing) return code;
    }
  }

  private async generateMemberId(): Promise<string> {
    for (;;) {
      const digits = Math.floor(100000 + Math.random() * 900000);
      const code = `2XL-${digits}`;
      const existing = await this.prisma.user.findUnique({
        where: { memberId: code },
      });
      if (!existing) return code;
    }
  }

  private toPublicUser(user: {
    id: bigint;
    fullName: string;
    phoneNumber: string;
    ownReferralCode: string | null;
    memberId: string;
    balance: Prisma.Decimal;
  }) {
    return {
      id: user.id.toString(),
      name: user.fullName,
      phone: user.phoneNumber,
      referralCode: user.ownReferralCode,
      memberId: user.memberId,
      balance: `৳${Number(user.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }

  async register(dto: RegisterDto, signupIp: string | null = null) {
    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existing) {
      throw new ConflictException('This phone number is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const ownReferralCode = await this.generateOwnReferralCode();
    const memberId = await this.generateMemberId();

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        referralCode: dto.referralCode || null,
        ownReferralCode,
        memberId,
        isAdult: dto.isAdult ?? dto.agreedTerms,
        agreedTerms: dto.agreedTerms,
      },
    });

    // Resolves dto.referralCode against a real referrer and creates the
    // tracking row — never blocks registration on failure.
    await this.referralService.linkReferral(user.id, dto.referralCode, signupIp);

    // Never let a broken offer definition block registration.
    try {
      await this.offersService.processTrigger({
        type: 'signup',
        userId: user.id,
      });
    } catch (err) {
      this.logger.error(
        `Offer trigger failed for user ${user.id}: ${(err as Error).message}`,
      );
    }

    const token = await this.jwt.signAsync({
      sub: user.id.toString(),
      phone: user.phoneNumber,
    });
    return { token, user: this.toPublicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }

    // Never let a streak-tracking bug block login.
    try {
      await this.loginStreakService.recordLogin(user.id);
    } catch (err) {
      this.logger.error(
        `Login streak update failed for ${user.id}: ${(err as Error).message}`,
      );
    }

    const token = await this.jwt.signAsync({
      sub: user.id.toString(),
      phone: user.phoneNumber,
    });
    return { token, user: this.toPublicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toPublicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const matches = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { success: true };
  }
}
