import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cashback')
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get('history')
  history(@Req() req: { user: { userId: string } }) {
    return this.cashbackService.getUserCashbackHistory(BigInt(req.user.userId));
  }
}
