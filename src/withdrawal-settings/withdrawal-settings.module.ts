import { Module } from '@nestjs/common';
import { WithdrawalSettingsController } from './withdrawal-settings.controller';
import { WithdrawalSettingsService } from './withdrawal-settings.service';

@Module({
  controllers: [WithdrawalSettingsController],
  providers: [WithdrawalSettingsService],
  exports: [WithdrawalSettingsService],
})
export class WithdrawalSettingsModule {}
