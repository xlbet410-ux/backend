import { Body, Controller, Delete, Get, Param, Post, Req, Sse, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SendAgentMessageDto } from './dto/send-agent-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { StreamTicketGuard } from './guards/stream-ticket.guard';

type AuthedRequest = { user: { userId: string } };

@Controller('conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ── Player-facing (bet frontend, JWT-authenticated) ─────────────

  @UseGuards(JwtAuthGuard)
  @Post()
  createConversation(@Req() req: AuthedRequest) {
    return this.chatService.getOrCreateConversation(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/messages')
  async getPlayerMessages(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.chatService.assertPlayerOwnsConversation(req.user.userId, id);
    return this.chatService.getMessages(id);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 10_000 } })
  @Post(':id/messages')
  sendPlayerMessage(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.chatService.postPlayerMessage(req.user.userId, id, dto.body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/stream-ticket')
  async createStreamTicket(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.chatService.assertPlayerOwnsConversation(req.user.userId, id);
    return { ticket: this.chatService.createStreamTicket(req.user.userId, id) };
  }

  @UseGuards(StreamTicketGuard)
  @Sse(':id/stream')
  streamPlayerMessages(@Param('id') id: string): Observable<{ data: unknown }> {
    return this.chatService.streamMessages(id);
  }

  // ── CRM-facing (proxied server-to-server, API-key authenticated) ─

  @UseGuards(ApiKeyGuard)
  @Get()
  listConversations() {
    return this.chatService.listOpenConversations();
  }

  @UseGuards(ApiKeyGuard)
  @Sse('stream')
  streamAllConversations(): Observable<{ data: unknown }> {
    return this.chatService.streamAllMessages();
  }

  @UseGuards(ApiKeyGuard)
  @Get(':id/agent-messages')
  getAgentMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }

  @UseGuards(ApiKeyGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 10_000 } })
  @Post(':id/agent-messages')
  sendAgentMessage(@Param('id') id: string, @Body() dto: SendAgentMessageDto) {
    return this.chatService.postAgentMessage(id, dto.staffUsername, dto.body);
  }

  @UseGuards(ApiKeyGuard)
  @Sse(':id/agent-stream')
  streamAgentMessages(@Param('id') id: string): Observable<{ data: unknown }> {
    return this.chatService.streamMessages(id);
  }

  @UseGuards(ApiKeyGuard)
  @Delete(':id')
  resolve(@Param('id') id: string) {
    return this.chatService.resolveConversation(id);
  }
}
