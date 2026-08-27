import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { ReviewReferralDto } from './dto/review-referral.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Admin-only — called by the CRM server-side, same trust model as every
// other /admin route in this app: API key, not end-user auth.
@UseGuards(ApiKeyGuard)
@Controller('admin/referral')
export class ReferralAdminController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('list')
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.referralService.adminListReferrals({
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewReferralDto) {
    return this.referralService.adminReviewReferral(
      BigInt(id),
      dto.decision,
      dto.reviewedBy,
      dto.notes,
    );
  }

  @Get('commissions')
  commissions(
    @Query('referrerId') referrerId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.referralService.adminGetCommissions(
      referrerId ? BigInt(referrerId) : undefined,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }
}
