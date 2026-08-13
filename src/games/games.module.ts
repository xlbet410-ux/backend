import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { BonusModule } from '../bonus/bonus.module';
import { VipModule } from '../vip/vip.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [BonusModule, VipModule, ReferralModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
