import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('stats')
  stats(@Req() req: { user: { userId: string } }) {
    return this.referralService.getReferralStats(BigInt(req.user.userId));
  }
}
