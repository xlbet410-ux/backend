import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetWithdrawPasswordDto } from './dto/set-withdraw-password.dto';
import { ForgotPasswordSendOtpDto } from './dto/forgot-password-send-otp.dto';
import { ForgotPasswordVerifyOtpDto } from './dto/forgot-password-verify-otp.dto';
import { ForgotPasswordResetDto } from './dto/forgot-password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Tighter than the global default: registration bots/spam are cheap to
  // throw at this endpoint otherwise.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip ?? null);
  }

  // Tighter than the global default: this is the brute-force target on a
  // betting site, so it gets its own per-IP limit instead of the shared 20/10s.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { userId: string } }) {
    return this.authService.me(req.user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Req() req: { user: { userId: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  // --- Withdrawal password — separate from the login password above; see
  // AuthService for how it factors into the cash-out KYC gate.

  @UseGuards(JwtAuthGuard)
  @Get('withdraw-password/status')
  withdrawPasswordStatus(@Req() req: { user: { userId: string } }) {
    return this.authService.getWithdrawPasswordStatus(req.user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('withdraw-password')
  @HttpCode(HttpStatus.OK)
  setWithdrawPassword(
    @Req() req: { user: { userId: string } },
    @Body() dto: SetWithdrawPasswordDto,
  ) {
    return this.authService.setWithdrawPassword(req.user.userId, dto);
  }

  // --- Forgot password (unauthenticated) — mirrors the throttle shape of
  // login/register above, since this is just as much a brute-force/abuse
  // target as they are.

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password/send-otp')
  @HttpCode(HttpStatus.OK)
  forgotPasswordSendOtp(@Body() dto: ForgotPasswordSendOtpDto) {
    return this.authService.requestPasswordReset(dto.phoneNumber);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password/verify-otp')
  @HttpCode(HttpStatus.OK)
  forgotPasswordVerifyOtp(@Body() dto: ForgotPasswordVerifyOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto.phoneNumber, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  forgotPasswordReset(@Body() dto: ForgotPasswordResetDto) {
    return this.authService.resetPasswordWithOtp(dto.phoneNumber, dto.newPassword);
  }
}
