import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [OffersModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
