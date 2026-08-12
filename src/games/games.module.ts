import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { BonusModule } from '../bonus/bonus.module';
import { VipModule } from '../vip/vip.module';

@Module({
  imports: [BonusModule, VipModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
