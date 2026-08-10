import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { RejectKycDto } from './dto/reject-kyc.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'back', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } },
    ),
  )
  submit(
    @Req() req: { user: { userId: string } },
    @Body() dto: SubmitKycDto,
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      back?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    return this.kycService.submit(req.user.userId, dto, files);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { userId: string } }) {
    return this.kycService.findMine(req.user.userId);
  }

  @UseGuards(ApiKeyGuard)
  @Get()
  findAll() {
    return this.kycService.findAll();
  }

  @UseGuards(ApiKeyGuard)
  @Get(':id/image/:side')
  async getImage(
    @Param('id') id: string,
    @Param('side') side: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, contentType } = await this.kycService.getImageStream(
      id,
      side,
    );
    res.set({ 'Content-Type': contentType });
    return new StreamableFile(stream);
  }

  @UseGuards(ApiKeyGuard)
  @Patch(':id/verify')
  @HttpCode(HttpStatus.OK)
  verify(@Param('id') id: string, @Body() dto: VerifyKycDto) {
    return this.kycService.verify(id, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: RejectKycDto) {
    return this.kycService.reject(id, dto);
  }
}
