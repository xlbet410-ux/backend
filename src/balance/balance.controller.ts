import { Controller, Post, Req, Sse, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { BalanceService } from './balance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BalanceStreamTicketGuard } from './guards/balance-stream-ticket.guard';

@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @UseGuards(JwtAuthGuard)
  @Post('stream-ticket')
  createTicket(@Req() req: { user: { userId: string } }) {
    return { ticket: this.balanceService.createStreamTicket(req.user.userId) };
  }

  @UseGuards(BalanceStreamTicketGuard)
  @Sse('stream')
  stream(
    @Req() req: Request & { streamUserId: string },
  ): Observable<{ data: unknown }> {
    return this.balanceService.streamForUser(req.streamUserId);
  }
}
