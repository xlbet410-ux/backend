import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { BonusModule } from '../bonus/bonus.module';
import { VipModule } from '../vip/vip.module';
import { ReferralModule } from '../referral/referral.module';
import { BalanceModule } from '../balance/balance.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [BonusModule, VipModule, ReferralModule, BalanceModule, AgentsModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
