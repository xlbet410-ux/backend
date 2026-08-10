import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { OffersModule } from '../offers/offers.module';
import { BonusModule } from '../bonus/bonus.module';

@Module({
  imports: [OffersModule, BonusModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
