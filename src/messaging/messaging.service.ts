import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const OSMS_BASE_URL_DEFAULT = 'https://api.o-sms.com/api/service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private authHeaders(): HeadersInit {
    const apiKey = this.config.get<string>('OSMS_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'SMS provider is not configured (missing OSMS_API_KEY).',
      );
    }
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private baseUrl(): string {
    return this.config.get<string>('OSMS_BASE_URL') ?? OSMS_BASE_URL_DEFAULT;
  }

  async sendSingle(phoneNumber: string, message: string): Promise<void> {
    let data: { success?: boolean; message?: string } | null = null;
    try {
      const res = await fetch(`${this.baseUrl()}/send-single`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ phoneNumber, message }),
      });
      data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `SMS send failed for ${phoneNumber}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        `Couldn't send SMS: ${(err as Error).message}`,
      );
    }
  }

  async sendBulk(
    phoneNumbers: string[],
    message: string,
  ): Promise<{ sent: number }> {
    if (phoneNumbers.length === 0) return { sent: 0 };

    let data: { success?: boolean; message?: string } | null = null;
    try {
      const res = await fetch(`${this.baseUrl()}/send-bulk`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ phoneNumbers, message }),
      });
      data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Bulk SMS failed for ${phoneNumbers.length} recipients: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        `Couldn't send bulk SMS: ${(err as Error).message}`,
      );
    }
    return { sent: phoneNumbers.length };
  }

  /** 'all' for every player, or a specific VIP level (0-50). */
  private async getRecipientPhones(level: number | 'all'): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: level === 'all' ? {} : { vipLevel: level },
      select: { phoneNumber: true },
    });
    return users.map((u) => u.phoneNumber);
  }

  async sendToLevel(
    level: number | 'all',
    message: string,
  ): Promise<{ sent: number }> {
    const phones = await this.getRecipientPhones(level);
    return this.sendBulk(phones, message);
  }
}
