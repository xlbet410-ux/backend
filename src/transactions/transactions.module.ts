import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { OffersModule } from '../offers/offers.module';
import { BonusModule } from '../bonus/bonus.module';
import { VipModule } from '../vip/vip.module';
import { ReferralModule } from '../referral/referral.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [OffersModule, BonusModule, VipModule, ReferralModule, NotificationModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
