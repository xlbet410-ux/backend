import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { OffersAdminController } from './offers-admin.controller';
import { BonusModule } from '../bonus/bonus.module';

@Module({
  imports: [BonusModule],
  controllers: [OffersController, OffersAdminController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
