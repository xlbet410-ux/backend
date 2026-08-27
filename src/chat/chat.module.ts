import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { StreamTicketGuard } from './guards/stream-ticket.guard';

@Module({
  controllers: [ChatController],
  providers: [ChatService, StreamTicketGuard],
})
export class ChatModule {}
