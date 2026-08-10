import { Module } from '@nestjs/common';
import { BonusService } from './bonus.service';

@Module({
  providers: [BonusService],
  exports: [BonusService],
})
export class BonusModule {}
