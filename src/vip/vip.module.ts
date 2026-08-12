import { Module } from '@nestjs/common';
import { VipService } from './vip.service';
import { VipController } from './vip.controller';
import { VipAdminController } from './vip-admin.controller';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [OffersModule],
  controllers: [VipController, VipAdminController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
