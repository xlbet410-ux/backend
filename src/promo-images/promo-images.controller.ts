import { BadRequestException, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PromoImagesService } from './promo-images.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

@Controller('promo-images')
export class PromoImagesController {
  constructor(private readonly promoImagesService: PromoImagesService) {}

  @Get()
  findAllActive() {
    return this.promoImagesService.findAllActive();
  }

  @UseGuards(ApiKeyGuard)
  @Get('admin')
  findAll() {
    return this.promoImagesService.findAll();
  }

  @UseGuards(ApiKeyGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    return this.promoImagesService.upload(file);
  }

  @UseGuards(ApiKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promoImagesService.remove(id);
  }
}
