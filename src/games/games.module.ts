import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { BonusModule } from '../bonus/bonus.module';

@Module({
  imports: [BonusModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
