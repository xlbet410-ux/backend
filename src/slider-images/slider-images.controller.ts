import { BadRequestException, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SliderImagesService } from './slider-images.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

@Controller('slider-images')
export class SliderImagesController {
  constructor(private readonly sliderImagesService: SliderImagesService) {}

  @Get()
  findAllActive() {
    return this.sliderImagesService.findAllActive();
  }

  @UseGuards(ApiKeyGuard)
  @Get('admin')
  findAll() {
    return this.sliderImagesService.findAll();
  }

  @UseGuards(ApiKeyGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    return this.sliderImagesService.upload(file);
  }

  @UseGuards(ApiKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sliderImagesService.remove(id);
  }
}
