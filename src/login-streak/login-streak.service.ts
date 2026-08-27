import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';
import { startOfUTCDay, isSameUTCDay } from '../common/date.util';

const MILESTONE_DAYS = [7, 14, 30, 60, 100, 365];

@Injectable()
export class LoginStreakService {
  private readonly logger = new Logger(LoginStreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
  ) {}

  /**
   * Called from AuthService.login() after successful auth. Never throws —
   * callers wrap this the same way every other post-login side effect in
   * this app is wrapped.
   */
  async recordLogin(userId: bigint): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const today = startOfUTCDay(new Date());
    if (user.lastLoginDate && isSameUTCDay(user.lastLoginDate, today)) {
      return; // Already recorded today — logging in again doesn't advance the streak.
    }

    let newStreak = 1;
    if (user.lastLoginDate) {
      const daysSince = Math.round(
        (today.getTime() - startOfUTCDay(user.lastLoginDate).getTime()) / 86_400_000,
      );
      if (daysSince === 1) newStreak = user.loginStreak + 1;
      // Any gap > 1 day resets to 1 (the default above).
    }

    const isMilestone = MILESTONE_DAYS.includes(newStreak);
    const longestLoginStreak = Math.max(user.longestLoginStreak, newStreak);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          lastLoginDate: today,
          loginStreak: newStreak,
          longestLoginStreak,
          totalLogins: { increment: 1 },
        },
      });
      await tx.loginStreakLog.create({
        data: { userId, loginDate: today, streakDay: newStreak, isMilestone },
      });
    });

    try {
      await this.offersService.processTrigger({ type: 'daily_login', userId });
    } catch (err) {
      this.logger.error(
        `daily_login offer trigger failed for ${userId}: ${(err as Error).message}`,
      );
    }
  }

  async getStreakInfo(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const nextMilestone = MILESTONE_DAYS.find((m) => m > user.loginStreak) ?? null;
    return {
      currentStreak: user.loginStreak,
      longestStreak: user.longestLoginStreak,
      totalLogins: user.totalLogins,
      lastLoginDate: user.lastLoginDate?.toISOString().slice(0, 10) ?? null,
      nextMilestone,
      milestones: MILESTONE_DAYS,
    };
  }
}
