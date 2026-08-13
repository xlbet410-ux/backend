import { Module } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { CashbackController } from './cashback.controller';
import { CashbackAdminController } from './cashback-admin.controller';
import { VipModule } from '../vip/vip.module';
import { NotificationModule } from '../notification/notification.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [VipModule, NotificationModule, BalanceModule],
  controllers: [CashbackController, CashbackAdminController],
  providers: [CashbackService],
  exports: [CashbackService],
})
export class CashbackModule {}
