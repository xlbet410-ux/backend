import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  list(
    @Req() req: { user: { userId: string } },
    @Query('page') page?: string,
  ) {
    return this.notificationService.getForUser(
      BigInt(req.user.userId),
      page ? Number(page) : undefined,
    );
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: { userId: string } }) {
    return this.notificationService.getUnreadCount(BigInt(req.user.userId));
  }

  @Post('mark-read')
  markRead(@Req() req: { user: { userId: string } }) {
    return this.notificationService.markAllRead(BigInt(req.user.userId));
  }
}
