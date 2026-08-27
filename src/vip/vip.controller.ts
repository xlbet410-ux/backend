import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { VipService } from './vip.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('vip')
export class VipController {
  constructor(private readonly vipService: VipService) {}

  @Get('tiers')
  getTiers() {
    return this.vipService.getAllTiers();
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Req() req: { user: { userId: string } }) {
    return this.vipService.getUserVipStatus(BigInt(req.user.userId));
  }
}
