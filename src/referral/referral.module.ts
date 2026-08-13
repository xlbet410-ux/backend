import { Module } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { ReferralAdminController } from './referral-admin.controller';
import { VipModule } from '../vip/vip.module';
import { OffersModule } from '../offers/offers.module';
import { NotificationModule } from '../notification/notification.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [VipModule, OffersModule, NotificationModule, BalanceModule],
  controllers: [ReferralController, ReferralAdminController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
