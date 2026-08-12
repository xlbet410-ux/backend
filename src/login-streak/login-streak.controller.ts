import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { LoginStreakService } from './login-streak.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('login-streak')
export class LoginStreakController {
  constructor(private readonly loginStreakService: LoginStreakService) {}

  @Get('status')
  status(@Req() req: { user: { userId: string } }) {
    return this.loginStreakService.getStreakInfo(BigInt(req.user.userId));
  }
}
