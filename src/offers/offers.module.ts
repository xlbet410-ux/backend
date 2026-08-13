import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { OffersAdminController } from './offers-admin.controller';
import { BonusModule } from '../bonus/bonus.module';
import { NotificationModule } from '../notification/notification.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [BonusModule, NotificationModule, BalanceModule],
  controllers: [OffersController, OffersAdminController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
