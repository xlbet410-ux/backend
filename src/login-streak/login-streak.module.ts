import { Module } from '@nestjs/common';
import { LoginStreakService } from './login-streak.service';
import { LoginStreakController } from './login-streak.controller';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [OffersModule],
  controllers: [LoginStreakController],
  providers: [LoginStreakService],
  exports: [LoginStreakService],
})
export class LoginStreakModule {}
