import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

type PublicMessage = {
  id: string;
  conversationId: string;
  senderType: string;
  senderName: string | null;
  body: string;
  createdAt: string;
};

type TicketEntry = { conversationId: string; userId: string; expiresAt: number };

const TICKET_TTL_MS = 30_000;

@Injectable()
export class ChatService {
  private readonly messageEvents$ = new Subject<{ conversationId: string; message: PublicMessage }>();
  private readonly ticketStore = new Map<string, TicketEntry>();

  constructor(private readonly prisma: PrismaService) {
    setInterval(() => this.sweepExpiredTickets(), 60_000).unref();
  }

  private sweepExpiredTickets() {
    const now = Date.now();
    for (const [ticket, entry] of this.ticketStore) {
      if (entry.expiresAt < now) this.ticketStore.delete(ticket);
    }
  }

  private toPublicMessage(
    m: { id: bigint; conversationId: bigint; senderType: string; body: string; createdAt: Date },
    senderName: string | null,
  ): PublicMessage {
    return {
      id: m.id.toString(),
      conversationId: m.conversationId.toString(),
      senderType: m.senderType,
      senderName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async getOrCreateConversation(userId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { userId: BigInt(userId), status: 'open' },
    });
    if (existing) return { id: existing.id.toString() };

    const created = await this.prisma.conversation.create({
      data: { userId: BigInt(userId), status: 'open' },
    });
    return { id: created.id.toString() };
  }

  async assertPlayerOwnsConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: BigInt(conversationId) } });
    if (!conversation || conversation.userId !== BigInt(userId)) {
      throw new NotFoundException('Conversation not found.');
    }
    return conversation;
  }

  async getMessages(conversationId: string): Promise<PublicMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId: BigInt(conversationId) },
      include: { senderAccount: true },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map((m) => this.toPublicMessage(m, m.senderAccount?.username ?? null));
  }

  async postPlayerMessage(userId: string, conversationId: string, body: string): Promise<PublicMessage> {
    await this.assertPlayerOwnsConversation(userId, conversationId);

    const message = await this.prisma.message.create({
      data: { conversationId: BigInt(conversationId), senderType: 'player', body },
    });
    await this.prisma.conversation.update({
      where: { id: BigInt(conversationId) },
      data: { updatedAt: new Date() },
    });

    const publicMessage = this.toPublicMessage(message, null);
    this.messageEvents$.next({ conversationId, message: publicMessage });
    return publicMessage;
  }

  async postAgentMessage(conversationId: string, staffUsername: string, body: string): Promise<PublicMessage> {
    const account = await this.prisma.account.findUnique({ where: { username: staffUsername } });
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Invalid staff account.');
    }

    const conversation = await this.prisma.conversation.findUnique({ where: { id: BigInt(conversationId) } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const message = await this.prisma.message.create({
      data: { conversationId: BigInt(conversationId), senderType: 'agent', senderAccountId: account.id, body },
    });
    await this.prisma.conversation.update({
      where: { id: BigInt(conversationId) },
      data: { updatedAt: new Date(), assignedAgent: conversation.assignedAgent ?? account.id },
    });

    const publicMessage = this.toPublicMessage(message, account.username);
    this.messageEvents$.next({ conversationId, message: publicMessage });
    return publicMessage;
  }

  async listOpenConversations() {
    const conversations = await this.prisma.conversation.findMany({
      where: { status: 'open' },
      include: { user: true, agent: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
    return conversations.map((c) => ({
      id: c.id.toString(),
      player: c.user.fullName,
      phone: c.user.phoneNumber,
      assignedAgent: c.agent?.username ?? null,
      lastMessage: c.messages[0]?.body ?? null,
      lastMessageAt: (c.messages[0]?.createdAt ?? c.createdAt).toISOString(),
    }));
  }

  async resolveConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: BigInt(conversationId) } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    await this.prisma.conversation.delete({ where: { id: conversation.id } });
    return { success: true };
  }

  createStreamTicket(userId: string, conversationId: string): string {
    const ticket = randomBytes(24).toString('hex');
    this.ticketStore.set(ticket, { conversationId, userId, expiresAt: Date.now() + TICKET_TTL_MS });
    return ticket;
  }

  consumeStreamTicket(ticket: string, conversationId: string): TicketEntry {
    const entry = this.ticketStore.get(ticket);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired stream ticket.');
    }
    this.ticketStore.delete(ticket);
    if (entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Stream ticket expired.');
    }
    if (entry.conversationId !== conversationId) {
      throw new UnauthorizedException('Stream ticket does not match this conversation.');
    }
    return entry;
  }

  streamMessages(conversationId: string) {
    return this.messageEvents$.pipe(
      filter((e) => e.conversationId === conversationId),
      map((e) => ({ data: e.message })),
    );
  }

  streamAllMessages() {
    return this.messageEvents$.pipe(map((e) => ({ data: e.message })));
  }
}
