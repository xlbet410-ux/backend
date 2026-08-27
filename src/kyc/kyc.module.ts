import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { OffersModule } from '../offers/offers.module';
import { NotificationModule } from '../notification/notification.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [OffersModule, NotificationModule, OtpModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
