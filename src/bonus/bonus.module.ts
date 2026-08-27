import { Module } from '@nestjs/common';
import { BonusService } from './bonus.service';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [BalanceModule],
  providers: [BonusService],
  exports: [BonusService],
})
export class BonusModule {}
