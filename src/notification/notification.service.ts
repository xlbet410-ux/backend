import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

// Drives client-side bilingual rendering — the bet app has its own
// translation dictionary keyed by these strings, same pattern as VIP tier
// names / offer categories elsewhere in this app. Keep this list in sync
// with whatever the frontend switches on.
export type NotificationType =
  | 'referral_signup_bonus'
  | 'vip_levelup'
  | 'daily_cashback'
  | 'offer_bonus'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'deposit_approved'
  | 'withdrawal_approved'
  | 'withdrawal_rejected';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget by design — swallows its own errors internally rather
   * than requiring every one of its many call sites (VIP, referral,
   * cashback, offers, KYC, transactions) to remember their own try/catch.
   * A broken notification must never be able to break the real event that
   * triggered it.
   */
  async create(
    userId: bigint,
    type: NotificationType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          type,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to create '${type}' notification for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  async getForUser(userId: bigint, page = 1, pageSize = 30) {
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      total,
      unreadCount,
      notifications: rows.map((n) => ({
        id: n.id.toString(),
        type: n.type,
        metadata: n.metadata as Record<string, unknown> | null,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async getUnreadCount(userId: bigint): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /** Called when the player opens the notification panel — clears the badge. */
  async markAllRead(userId: bigint) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }
}
