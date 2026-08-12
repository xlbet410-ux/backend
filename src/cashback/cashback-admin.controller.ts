import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller('admin/cashback')
export class CashbackAdminController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get('list')
  list(
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.cashbackService.adminListGrants({
      userId: userId ? BigInt(userId) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  // Manual trigger — useful right after deploying/testing, or to recover
  // from a missed sweep. Safe to call any time: every grant is idempotent
  // per (userId, calculationDate).
  @Post('run-sweep')
  runSweep() {
    return this.cashbackService.runDailySweep();
  }
}
