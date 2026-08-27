import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ChatService } from '../chat.service';

@Injectable()
export class StreamTicketGuard implements CanActivate {
  constructor(private readonly chatService: ChatService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ticket = request.query.ticket;
    const conversationId = request.params.id;

    if (typeof ticket !== 'string' || typeof conversationId !== 'string') {
      throw new UnauthorizedException('Missing stream ticket.');
    }

    this.chatService.consumeStreamTicket(ticket, conversationId);
    return true;
  }
}
