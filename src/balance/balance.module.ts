import { Module } from '@nestjs/common';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { BalanceStreamTicketGuard } from './guards/balance-stream-ticket.guard';

@Module({
  controllers: [BalanceController],
  providers: [BalanceService, BalanceStreamTicketGuard],
  exports: [BalanceService],
})
export class BalanceModule {}
