import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Subject, from } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

type TicketEntry = { userId: string; expiresAt: number };

const TICKET_TTL_MS = 30_000;

@Injectable()
export class BalanceService {
  private readonly changeEvents$ = new Subject<{ userId: string }>();
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

  /**
   * Called by anything that just changed a user's balance — deposit/
   * withdrawal approval, a settled game bet, or a bonus grant/forfeit — so
   * the bet app's wallet updates instantly instead of waiting for the next
   * page load. Carries no balance value itself; the stream re-reads the
   * current balance from the DB on each event, so it can never push a
   * value that's gone stale by the time it's sent.
   */
  notifyChanged(userId: bigint): void {
    this.changeEvents$.next({ userId: userId.toString() });
  }

  createStreamTicket(userId: string): string {
    const ticket = randomBytes(24).toString('hex');
    this.ticketStore.set(ticket, {
      userId,
      expiresAt: Date.now() + TICKET_TTL_MS,
    });
    return ticket;
  }

  consumeStreamTicket(ticket: string): TicketEntry {
    const entry = this.ticketStore.get(ticket);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired stream ticket.');
    }
    this.ticketStore.delete(ticket);
    if (entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Stream ticket expired.');
    }
    return entry;
  }

  streamForUser(userId: string) {
    return this.changeEvents$.pipe(
      filter((e) => e.userId === userId),
      switchMap(() =>
        from(
          this.prisma.user.findUniqueOrThrow({
            where: { id: BigInt(userId) },
            select: { balance: true },
          }),
        ),
      ),
      map((u) => ({ data: { balance: u.balance.toString() } })),
    );
  }
}
