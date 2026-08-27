import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Must match exactly what the CRM's confirmation dialog requires the admin
// to type — a second, server-side gate so this can never fire from a
// stray/scripted call, only a deliberate one with the phrase in hand.
const CONFIRM_PHRASE = 'DELETE ALL DATA';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Irreversibly wipes every user, agent, and cash transaction — and, by
   * foreign-key cascade, everything that belongs to them: KYC records, game
   * transactions, payment accounts, agent commissions, bonus wallets, offer
   * claims, referrals + their commissions, cashback grants, login-streak
   * logs, VIP upgrade logs, notifications, and chat conversations/messages.
   *
   * Deliberately untouched — this is platform CONFIGURATION, not
   * user/agent/transaction DATA: staff accounts, roles, page catalog,
   * offers/promotions, VIP tier definitions, slider/promo images.
   *
   * Uses TRUNCATE ... CASCADE rather than enumerating DELETEs by hand —
   * Postgres discovers every dependent table via its real foreign-key
   * graph, so this can't silently miss a table the way a manually
   * maintained DELETE list could (verified against every migration's
   * actual ON DELETE clauses before writing this). RESTART IDENTITY resets
   * every wiped table's id sequence back to 1, cascading to every table
   * TRUNCATE pulls in.
   */
  async resetPlatformData(confirm: string) {
    if (confirm !== CONFIRM_PHRASE) {
      throw new BadRequestException(
        `Confirmation phrase did not match. Send { "confirm": "${CONFIRM_PHRASE}" } to proceed.`,
      );
    }

    const [userCount, agentCount, cashTransactionCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.agent.count(),
      this.prisma.cashTransaction.count(),
    ]);

    this.logger.warn(
      `Platform data reset starting — about to delete ${userCount} users, ${agentCount} agents, ${cashTransactionCount} cash transactions (and everything cascading from them).`,
    );

    await this.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "users", "agents", "cash_transactions" RESTART IDENTITY CASCADE;',
    );

    this.logger.warn('Platform data reset complete.');

    return {
      success: true,
      deleted: {
        users: userCount,
        agents: agentCount,
        cashTransactions: cashTransactionCount,
      },
    };
  }
}
