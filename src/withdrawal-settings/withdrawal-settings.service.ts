import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWithdrawalSettingsDto } from './dto/update-withdrawal-settings.dto';

const SETTINGS_ID = 1;

@Injectable()
export class WithdrawalSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(settings: {
    kycEnabled: boolean;
    withdrawPasswordEnabled: boolean;
  }) {
    return {
      kycEnabled: settings.kycEnabled,
      withdrawPasswordEnabled: settings.withdrawPasswordEnabled,
    };
  }

  // Upserts the fixed singleton row instead of relying solely on the
  // migration's seed insert, so this stays self-healing if that row is
  // ever missing.
  async get() {
    const settings = await this.prisma.withdrawalSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    return this.toPublic(settings);
  }

  async update(dto: UpdateWithdrawalSettingsDto) {
    const settings = await this.prisma.withdrawalSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        ...(dto.kycEnabled !== undefined && { kycEnabled: dto.kycEnabled }),
        ...(dto.withdrawPasswordEnabled !== undefined && {
          withdrawPasswordEnabled: dto.withdrawPasswordEnabled,
        }),
      },
      create: {
        id: SETTINGS_ID,
        kycEnabled: dto.kycEnabled ?? true,
        withdrawPasswordEnabled: dto.withdrawPasswordEnabled ?? true,
      },
    });
    return this.toPublic(settings);
  }
}
