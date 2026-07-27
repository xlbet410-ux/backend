import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ORACLE_BASE_URL_DEFAULT = 'https://oraclegames.net/api';
const GAME_ACCOUNT_LENGTH = 10;
const GAME_ACCOUNT_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

type CallbackPayload = {
  game_uid: string;
  game_round: string;
  serial_number: string;
  bet_amount: number;
  win_amount: number;
  member_account: string;
  currency_code: string;
  timestamp: number;
};

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('ORACLE_BASE_URL') ?? ORACLE_BASE_URL_DEFAULT;
  }

  private get apiKey(): string {
    const key = this.config.get<string>('ORACLE_API_KEY');
    if (!key) {
      throw new InternalServerErrorException('Game provider is not configured (missing ORACLE_API_KEY).');
    }
    return key;
  }

  private randomGameAccount(): string {
    const bytes = randomBytes(GAME_ACCOUNT_LENGTH);
    let out = '';
    for (let i = 0; i < GAME_ACCOUNT_LENGTH; i++) {
      out += GAME_ACCOUNT_CHARS[bytes[i] % GAME_ACCOUNT_CHARS.length];
    }
    return out;
  }

  private async ensureGameAccount(userId: bigint): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.gameAccount) return user.gameAccount;

    for (;;) {
      const candidate = this.randomGameAccount();
      const existing = await this.prisma.user.findUnique({ where: { gameAccount: candidate } });
      if (existing) continue;

      await this.prisma.user.update({ where: { id: userId }, data: { gameAccount: candidate } });
      return candidate;
    }
  }

  async launchGame(userId: string, gameUid: string) {
    const id = BigInt(userId);
    const [user, gameAccount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id } }),
      this.ensureGameAccount(id),
    ]);

    const res = await fetch(`${this.baseUrl}/getgameurl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-oracle-key': this.apiKey },
      body: JSON.stringify({ username: gameAccount, amount: Number(user.balance), game_uid: gameUid }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.status) {
      this.logger.error(`getgameurl failed for user ${userId}: ${JSON.stringify(data)}`);
      throw new BadRequestException(data?.message ?? "Couldn't launch this game right now.");
    }
    return { gameUrl: data.game_url as string };
  }

  async getProviders() {
    const res = await fetch(`${this.baseUrl}/manager/providerlist`, {
      headers: { 'x-oracle-key': this.apiKey },
    });
    if (!res.ok) {
      throw new BadRequestException("Couldn't load the game provider list.");
    }
    return res.json();
  }

  async getProviderGames(providerCode: string) {
    const res = await fetch(`${this.baseUrl}/manager/game/${encodeURIComponent(providerCode)}`, {
      headers: { 'x-oracle-key': this.apiKey },
    });
    if (!res.ok) {
      throw new BadRequestException("Couldn't load this provider's game list.");
    }
    return res.json();
  }

  async handleCallback(payload: CallbackPayload) {
    const { member_account, serial_number, bet_amount, win_amount, game_uid, game_round, currency_code } = payload;
    if (!member_account || !serial_number) {
      throw new BadRequestException('member_account and serial_number are required.');
    }

    // Idempotency: a retried callback with the same serial_number must not be applied twice.
    const existing = await this.prisma.gameTransaction.findUnique({ where: { serialNumber: serial_number } });
    if (existing) {
      return { balance: Number(existing.balanceAfter) };
    }

    try {
      const balanceAfter = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { gameAccount: member_account } });
        if (!user) {
          throw new NotFoundException(`No user found for member_account ${member_account}.`);
        }

        const newBalance = Number(user.balance) - Number(bet_amount || 0) + Number(win_amount || 0);
        await tx.user.update({ where: { id: user.id }, data: { balance: newBalance } });
        await tx.gameTransaction.create({
          data: {
            userId: user.id,
            gameUid: game_uid,
            gameRound: game_round,
            serialNumber: serial_number,
            betAmount: bet_amount || 0,
            winAmount: win_amount || 0,
            currencyCode: currency_code,
            balanceAfter: newBalance,
          },
        });
        return newBalance;
      });
      return { balance: balanceAfter };
    } catch (err) {
      // Two concurrent retries can both pass the findUnique check above before either
      // commits; the serial_number unique constraint catches that race here instead.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.gameTransaction.findUnique({ where: { serialNumber: serial_number } });
        if (row) return { balance: Number(row.balanceAfter) };
      }
      throw err;
    }
  }
}
