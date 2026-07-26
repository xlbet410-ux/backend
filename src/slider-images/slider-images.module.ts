import { Module } from '@nestjs/common';
import { SliderImagesController } from './slider-images.controller';
import { SliderImagesService } from './slider-images.service';

@Module({
  controllers: [SliderImagesController],
  providers: [SliderImagesService],
})
export class SliderImagesModule {}
