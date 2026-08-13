import { Module } from '@nestjs/common';
import { VipService } from './vip.service';
import { VipController } from './vip.controller';
import { VipAdminController } from './vip-admin.controller';
import { OffersModule } from '../offers/offers.module';
import { NotificationModule } from '../notification/notification.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [OffersModule, NotificationModule, BalanceModule],
  controllers: [VipController, VipAdminController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
