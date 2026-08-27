import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { BalanceService } from '../balance.service';

@Injectable()
export class BalanceStreamTicketGuard implements CanActivate {
  constructor(private readonly balanceService: BalanceService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { streamUserId?: string }>();
    const ticket = request.query.ticket;

    if (typeof ticket !== 'string') {
      throw new UnauthorizedException('Missing stream ticket.');
    }

    const entry = this.balanceService.consumeStreamTicket(ticket);
    request.streamUserId = entry.userId;
    return true;
  }
}
