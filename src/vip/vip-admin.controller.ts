import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { VipService } from './vip.service';
import { UpdateVipTierDto } from './dto/update-vip-tier.dto';
import { ManualOverrideDto } from './dto/manual-override.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Admin-only — called by the CRM server-side (same trust model as every
// other /admin-style route in this app: API key, not end-user auth).
@UseGuards(ApiKeyGuard)
@Controller('admin/vip')
export class VipAdminController {
  constructor(private readonly vipService: VipService) {}

  @Get('tiers')
  getTiers() {
    return this.vipService.getAllTiers();
  }

  @Patch('tiers/:level')
  updateTier(@Param('level') level: string, @Body() dto: UpdateVipTierDto) {
    return this.vipService.adminUpdateTier(Number(level), dto);
  }

  @Post('override')
  manualOverride(@Body() dto: ManualOverrideDto) {
    return this.vipService.adminManualOverride(
      BigInt(dto.userId),
      dto.level,
      dto.reason,
      dto.overrideBy,
    );
  }

  @Get('history')
  getHistory(
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.vipService.adminGetUpgradeHistory(
      userId ? BigInt(userId) : undefined,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get('distribution')
  getDistribution() {
    return this.vipService.adminGetDistribution();
  }
}
