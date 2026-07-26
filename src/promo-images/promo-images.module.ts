import { Module } from '@nestjs/common';
import { PromoImagesController } from './promo-images.controller';
import { PromoImagesService } from './promo-images.service';

@Module({
  controllers: [PromoImagesController],
  providers: [PromoImagesService],
})
export class PromoImagesModule {}
