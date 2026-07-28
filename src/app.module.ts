import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AccountsModule } from './accounts/accounts.module';
import { ChatModule } from './chat/chat.module';
import { SliderImagesModule } from './slider-images/slider-images.module';
import { KycModule } from './kyc/kyc.module';
import { PromoImagesModule } from './promo-images/promo-images.module';
import { GamesModule } from './games/games.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 10_000, limit: 20 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AccountsModule,
    ChatModule,
    SliderImagesModule,
    KycModule,
    PromoImagesModule,
    GamesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
