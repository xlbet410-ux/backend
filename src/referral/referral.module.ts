import { Module } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { ReferralAdminController } from './referral-admin.controller';
import { VipModule } from '../vip/vip.module';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [VipModule, OffersModule],
  controllers: [ReferralController, ReferralAdminController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
