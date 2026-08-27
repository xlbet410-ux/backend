import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OtpService } from './otp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@UseGuards(JwtAuthGuard)
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('send')
  async send(
    @Req() req: { user: { userId: string } },
    @Body() dto: SendOtpDto,
  ) {
    await this.otpService.sendOtp(req.user.userId, dto.phoneNumber);
    return { success: true };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify')
  verify(
    @Req() req: { user: { userId: string } },
    @Body() dto: VerifyOtpDto,
  ) {
    const verified = this.otpService.verifyOtp(req.user.userId, dto.code);
    if (!verified) {
      throw new BadRequestException('Invalid or expired code.');
    }
    return { verified: true };
  }
}
