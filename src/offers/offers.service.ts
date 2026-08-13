import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { NotificationService } from '../notification/notification.service';
import { BalanceService } from '../balance/balance.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'offers');
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// Cards never render an offer image larger than this — no point storing or
// shipping pixels past it. Re-encoding to webp is what actually shrinks
// file size; the resize just caps the upper bound for oversized phone photos.
const MAX_DIMENSION = 1600;

type TriggerBase = { userId: bigint };
type OfferTrigger =
  | (TriggerBase & { type: 'first_deposit'; amount: Prisma.Decimal })
  | (TriggerBase & {
      type: 'nth_deposit';
      amount: Prisma.Decimal;
      depositCount: number;
    })
  | (TriggerBase & { type: 'every_deposit'; amount: Prisma.Decimal })
  | (TriggerBase & { type: 'kyc_approved' })
  | (TriggerBase & { type: 'vip_levelup'; newLevel: number })
  | (TriggerBase & { type: 'referral_milestone'; tier: number })
  | (TriggerBase & { type: 'daily_login' })
  | (TriggerBase & { type: 'signup' })
  | (TriggerBase & { type: 'manual_claim'; offerId: bigint });

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly balanceService: BalanceService,
  ) {}

  // Re-encodes any uploaded offer image to webp (real, lossy compression —
  // not just a dimension check) and caps its dimensions. Returns the public
  // /uploads/... URL to be saved as the offer's imageUrl/bannerUrl.
  async uploadImage(file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PNG, JPG, WEBP, or GIF images are supported.');
    }

    let optimized: Buffer;
    try {
      optimized = await sharp(file.buffer)
        .rotate() // respect EXIF orientation before resizing
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("Couldn't read this image file. It may be corrupted.");
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    await writeFile(join(UPLOAD_DIR, filename), optimized);

    return { url: `/uploads/offers/${filename}` };
  }

  private toAdmin(
    offer: NonNullable<Awaited<ReturnType<typeof this.prisma.offer.findFirst>>>,
  ) {
    return {
      id: offer.id.toString(),
      slug: offer.slug,
      titleBn: offer.titleBn,
      titleEn: offer.titleEn,
      descriptionBn: offer.descriptionBn,
      descriptionEn: offer.descriptionEn,
      imageUrl: offer.imageUrl,
      bannerUrl: offer.bannerUrl,
      termsBn: offer.termsBn,
      termsEn: offer.termsEn,
      category: offer.category,
      triggerType: offer.triggerType,
      triggerConfig: offer.triggerConfig,
      minDeposit: offer.minDeposit?.toString() ?? null,
      maxDeposit: offer.maxDeposit?.toString() ?? null,
      requiredVipLevel: offer.requiredVipLevel,
      requiredAgentTier: offer.requiredAgentTier,
      requiresKyc: offer.requiresKyc,
      isNewUsersOnly: offer.isNewUsersOnly,
      maxClaimsPerUser: offer.maxClaimsPerUser,
      rewardType: offer.rewardType,
      rewardAmount: offer.rewardAmount?.toString() ?? null,
      rewardCap: offer.rewardCap?.toString() ?? null,
      turnoverMultiplier: offer.turnoverMultiplier.toString(),
      turnoverBase: offer.turnoverBase,
      bonusValidityDays: offer.bonusValidityDays,
      totalBudget: offer.totalBudget?.toString() ?? null,
      totalClaimed: offer.totalClaimed.toString(),
      startsAt: offer.startsAt?.toISOString() ?? null,
      endsAt: offer.endsAt?.toISOString() ?? null,
      isActive: offer.isActive,
      priority: offer.priority,
      claimCount: offer.claimCount,
      showInPromotionsPage: offer.showInPromotionsPage,
      showInPopup: offer.showInPopup,
      popupPriority: offer.popupPriority,
      popupCtaTextBn: offer.popupCtaTextBn,
      popupCtaTextEn: offer.popupCtaTextEn,
      popupCtaLink: offer.popupCtaLink,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    };
  }

  async findAllAdmin(filters: {
    category?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize =
      filters.pageSize && filters.pageSize > 0 && filters.pageSize <= 100
        ? filters.pageSize
        : 20;

    const where: Prisma.OfferWhereInput = {
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? {
            OR: [
              { slug: { contains: filters.search, mode: 'insensitive' } },
              { titleBn: { contains: filters.search, mode: 'insensitive' } },
              { titleEn: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { offers: rows.map((o) => this.toAdmin(o)), total, page, pageSize };
  }

  async findOneAdmin(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found.');
    }
    return this.toAdmin(offer);
  }

  async createOffer(dto: CreateOfferDto) {
    const existing = await this.prisma.offer.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('An offer with this slug already exists.');
    }

    const offer = await this.prisma.offer.create({
      data: {
        ...dto,
        triggerConfig: dto.triggerConfig as Prisma.InputJsonValue | undefined,
        eligibleGames: dto.eligibleGames as Prisma.InputJsonValue | undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    return this.toAdmin(offer);
  }

  async updateOffer(id: string, dto: UpdateOfferDto) {
    const existing = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Offer not found.');
    }
    if (dto.slug && dto.slug !== existing.slug) {
      const clash = await this.prisma.offer.findUnique({
        where: { slug: dto.slug },
      });
      if (clash) {
        throw new ConflictException('An offer with this slug already exists.');
      }
    }

    const offer = await this.prisma.offer.update({
      where: { id: existing.id },
      data: {
        ...dto,
        triggerConfig: dto.triggerConfig as Prisma.InputJsonValue | undefined,
        eligibleGames: dto.eligibleGames as Prisma.InputJsonValue | undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    return this.toAdmin(offer);
  }

  // Deactivates rather than deletes — existing OfferClaim/BonusWallet rows
  // reference this offer and must survive for audit/history purposes.
  async softDeleteOffer(id: string) {
    const existing = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Offer not found.');
    }
    await this.prisma.offer.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return { success: true };
  }

  // Actually removes the row — the DB itself also enforces this via
  // offer_claims' ON DELETE RESTRICT, but counting first gives a clearer
  // error than surfacing a raw constraint violation.
  async hardDeleteOffer(id: string) {
    const existing = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Offer not found.');
    }
    const claimCount = await this.prisma.offerClaim.count({
      where: { offerId: existing.id },
    });
    if (claimCount > 0) {
      throw new ConflictException(
        `Can't permanently delete — ${claimCount} player claim${claimCount === 1 ? '' : 's'} ${claimCount === 1 ? 'references' : 'reference'} this offer. Deactivate it instead.`,
      );
    }
    await this.prisma.offer.delete({ where: { id: existing.id } });
    return { success: true };
  }

  async toggleActive(id: string) {
    const existing = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Offer not found.');
    }
    const offer = await this.prisma.offer.update({
      where: { id: existing.id },
      data: { isActive: !existing.isActive },
    });
    return this.toAdmin(offer);
  }

  async duplicateOffer(id: string) {
    const existing = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Offer not found.');
    }

    let newSlug = `${existing.slug}-copy`;
    let suffix = 1;
    while (await this.prisma.offer.findUnique({ where: { slug: newSlug } })) {
      suffix += 1;
      newSlug = `${existing.slug}-copy-${suffix}`;
    }

    const offer = await this.prisma.offer.create({
      data: {
        slug: newSlug,
        titleBn: existing.titleBn,
        titleEn: existing.titleEn,
        descriptionBn: existing.descriptionBn,
        descriptionEn: existing.descriptionEn,
        imageUrl: existing.imageUrl,
        bannerUrl: existing.bannerUrl,
        termsBn: existing.termsBn,
        termsEn: existing.termsEn,
        category: existing.category,
        triggerType: existing.triggerType,
        triggerConfig: existing.triggerConfig as
          Prisma.InputJsonValue | undefined,
        minDeposit: existing.minDeposit,
        maxDeposit: existing.maxDeposit,
        requiredVipLevel: existing.requiredVipLevel,
        requiredAgentTier: existing.requiredAgentTier,
        requiresKyc: existing.requiresKyc,
        isNewUsersOnly: existing.isNewUsersOnly,
        maxClaimsPerUser: existing.maxClaimsPerUser,
        rewardType: existing.rewardType,
        rewardAmount: existing.rewardAmount,
        rewardCap: existing.rewardCap,
        turnoverMultiplier: existing.turnoverMultiplier,
        turnoverBase: existing.turnoverBase,
        bonusValidityDays: existing.bonusValidityDays,
        eligibleGames: existing.eligibleGames as Prisma.InputJsonValue,
        totalBudget: existing.totalBudget,
        // Deliberately NOT copied: startsAt/endsAt (a duplicate shouldn't
        // silently inherit a schedule that's already passed), isActive
        // (starts off so an admin reviews it before it goes live).
        isActive: false,
        priority: existing.priority,
      },
    });
    return this.toAdmin(offer);
  }

  async getOfferStats(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: BigInt(id) },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found.');
    }

    const uniqueUsers = await this.prisma.offerClaim.findMany({
      where: { offerId: offer.id },
      distinct: ['userId'],
      select: { userId: true },
    });
    const avgClaim =
      offer.claimCount > 0
        ? offer.totalClaimed.div(offer.claimCount)
        : new Prisma.Decimal(0);
    const budgetRemaining = offer.totalBudget
      ? offer.totalBudget.sub(offer.totalClaimed)
      : null;

    return {
      claimCount: offer.claimCount,
      totalClaimed: offer.totalClaimed.toString(),
      uniqueUsers: uniqueUsers.length,
      avgClaim: avgClaim.toString(),
      budgetRemaining: budgetRemaining?.toString() ?? null,
    };
  }

  /**
   * Called from every event handler in the system (deposit approval, KYC
   * approval, VIP level-up, ...). Finds every active offer matching this
   * trigger type, applies the ones the user actually qualifies for.
   */
  async processTrigger(trigger: OfferTrigger, chosenOfferId?: bigint) {
    const now = new Date();

    const candidates = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        triggerType: trigger.type,
        ...(chosenOfferId ? { id: chosenOfferId } : {}),
        ...(trigger.type === 'manual_claim' ? { id: trigger.offerId } : {}),
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { priority: 'desc' },
    });

    for (const offer of candidates) {
      if (await this.matchesConditions(offer, trigger)) {
        await this.applyOffer(offer, trigger);

        // A single deposit can only trigger one offer.
        if (
          trigger.type === 'first_deposit' ||
          trigger.type === 'nth_deposit' ||
          trigger.type === 'every_deposit'
        ) {
          break;
        }
      }
    }
  }

  /**
   * Public listing for a category page (referral, VIP/level, daily, ...) —
   * unlike getApplicableDepositOffers this isn't amount-gated, so it
   * annotates eligibility/claimed-out state instead of filtering rows out
   * entirely, letting the page show "already claimed" rather than nothing.
   */
  async listForUser(userId: bigint | undefined, category?: string) {
    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        showInPromotionsPage: true,
        ...(category ? { category } : {}),
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { priority: 'desc' },
    });

    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          include: { kycVerification: true },
        })
      : null;

    const result: Array<Record<string, unknown>> = [];
    for (const offer of offers) {
      let alreadyClaimed = false;
      if (userId) {
        const claims = await this.prisma.offerClaim.count({
          where: { offerId: offer.id, userId },
        });
        alreadyClaimed = claims >= offer.maxClaimsPerUser;
      }

      const eligible = user
        ? (!offer.requiresKyc || user.kycVerification?.status === 'verified') &&
          (!offer.requiredVipLevel ||
            user.vipLevel >= offer.requiredVipLevel) &&
          (!offer.requiredAgentTier ||
            user.agentTier >= offer.requiredAgentTier)
        : true;

      result.push({
        id: offer.id.toString(),
        slug: offer.slug,
        titleBn: offer.titleBn,
        titleEn: offer.titleEn,
        descriptionBn: offer.descriptionBn,
        descriptionEn: offer.descriptionEn,
        imageUrl: offer.imageUrl,
        bannerUrl: offer.bannerUrl,
        termsBn: offer.termsBn,
        termsEn: offer.termsEn,
        category: offer.category,
        triggerType: offer.triggerType,
        rewardType: offer.rewardType,
        rewardAmount: offer.rewardAmount?.toString() ?? null,
        rewardCap: offer.rewardCap?.toString() ?? null,
        turnoverMultiplier: offer.turnoverMultiplier.toString(),
        bonusValidityDays: offer.bonusValidityDays,
        alreadyClaimed,
        eligible,
      });
    }
    return result;
  }

  /** Active, in-window offers flagged for the homepage popup, newest-priority first. */
  async getPopupOffers() {
    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        showInPopup: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { popupPriority: 'desc' },
    });

    return offers.map((offer) => ({
      id: offer.id.toString(),
      slug: offer.slug,
      titleBn: offer.titleBn,
      titleEn: offer.titleEn,
      descriptionBn: offer.descriptionBn,
      descriptionEn: offer.descriptionEn,
      bannerUrl: offer.bannerUrl,
      imageUrl: offer.imageUrl,
      termsBn: offer.termsBn,
      termsEn: offer.termsEn,
      rewardType: offer.rewardType,
      rewardAmount: offer.rewardAmount?.toString() ?? null,
      rewardCap: offer.rewardCap?.toString() ?? null,
      popupCtaTextBn: offer.popupCtaTextBn,
      popupCtaTextEn: offer.popupCtaTextEn,
      popupCtaLink: offer.popupCtaLink,
    }));
  }

  /** Offers a user could pick on the deposit page for a given amount. */
  async getApplicableDepositOffers(userId: bigint, amount: Prisma.Decimal) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kycVerification: true },
    });
    if (!user) return [];

    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        category: 'deposit',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { priority: 'desc' },
    });

    const applicable: Array<Record<string, unknown>> = [];
    for (const offer of offers) {
      if (offer.minDeposit && amount.lessThan(offer.minDeposit)) continue;
      if (offer.maxDeposit && amount.greaterThan(offer.maxDeposit)) continue;
      if (offer.requiredVipLevel && user.vipLevel < offer.requiredVipLevel)
        continue;
      if (offer.requiresKyc && user.kycVerification?.status !== 'verified')
        continue;

      const claims = await this.prisma.offerClaim.count({
        where: { offerId: offer.id, userId },
      });
      if (claims >= offer.maxClaimsPerUser) continue;

      if (
        offer.totalBudget &&
        offer.totalClaimed.greaterThanOrEqualTo(offer.totalBudget)
      ) {
        continue;
      }

      if (offer.triggerType === 'nth_deposit') {
        const nth = (offer.triggerConfig as { nth?: number } | null)?.nth;
        const depositCount = await this.prisma.cashTransaction.count({
          where: { userId, type: 'cash_in', status: 'completed' },
        });
        if (nth && depositCount + 1 !== nth) continue;
      }

      const potentialReward = this.calculateReward(offer, amount);
      if (
        potentialReward.lessThanOrEqualTo(0) &&
        offer.rewardType !== 'no_reward'
      )
        continue;

      applicable.push({
        id: offer.id.toString(),
        slug: offer.slug,
        titleBn: offer.titleBn,
        titleEn: offer.titleEn,
        descriptionBn: offer.descriptionBn,
        imageUrl: offer.imageUrl,
        rewardType: offer.rewardType,
        rewardAmount: offer.rewardAmount?.toString(),
        rewardCap: offer.rewardCap?.toString(),
        potentialReward: potentialReward.toString(),
        turnoverMultiplier: offer.turnoverMultiplier.toString(),
        turnoverBase: offer.turnoverBase,
        bonusValidityDays: offer.bonusValidityDays,
        termsBn: offer.termsBn,
      });
    }

    return applicable;
  }

  private calculateReward(
    offer: {
      rewardType: string;
      rewardAmount: Prisma.Decimal | null;
      rewardCap: Prisma.Decimal | null;
    },
    amount?: Prisma.Decimal,
  ): Prisma.Decimal {
    if (offer.rewardType === 'fixed') {
      return offer.rewardAmount ?? new Prisma.Decimal(0);
    }
    if (offer.rewardType === 'percentage' && amount) {
      let reward = amount.mul(offer.rewardAmount ?? 0).div(100);
      if (offer.rewardCap && reward.greaterThan(offer.rewardCap)) {
        reward = offer.rewardCap;
      }
      return reward;
    }
    return new Prisma.Decimal(0);
  }

  private async matchesConditions(
    offer: Awaited<ReturnType<typeof this.prisma.offer.findFirst>> & object,
    trigger: OfferTrigger,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: trigger.userId },
      include: { kycVerification: true },
    });
    if (!user) return false;

    if (
      offer.totalBudget &&
      offer.totalClaimed.greaterThanOrEqualTo(offer.totalBudget)
    )
      return false;
    if (offer.requiresKyc && user.kycVerification?.status !== 'verified')
      return false;
    if (offer.requiredVipLevel && user.vipLevel < offer.requiredVipLevel)
      return false;
    if (offer.requiredAgentTier && user.agentTier < offer.requiredAgentTier)
      return false;

    const claims = await this.prisma.offerClaim.count({
      where: { offerId: offer.id, userId: trigger.userId },
    });
    if (claims >= offer.maxClaimsPerUser) return false;

    if (trigger.type === 'nth_deposit') {
      const nth = (offer.triggerConfig as { nth?: number } | null)?.nth;
      if (nth && trigger.depositCount !== nth) return false;
    }
    if (trigger.type === 'vip_levelup') {
      const vl = (offer.triggerConfig as { vipLevel?: number } | null)
        ?.vipLevel;
      if (vl && trigger.newLevel !== vl) return false;
    }
    if (trigger.type === 'referral_milestone') {
      const t = (offer.triggerConfig as { tier?: number } | null)?.tier;
      if (t && trigger.tier !== t) return false;
    }
    if ('amount' in trigger && trigger.amount) {
      if (offer.minDeposit && trigger.amount.lessThan(offer.minDeposit))
        return false;
      if (offer.maxDeposit && trigger.amount.greaterThan(offer.maxDeposit))
        return false;
    }

    return true;
  }

  private async applyOffer(
    offer: Awaited<ReturnType<typeof this.prisma.offer.findFirst>> & object,
    trigger: OfferTrigger,
  ) {
    const amount = 'amount' in trigger ? trigger.amount : undefined;
    const rewardAmount = this.calculateReward(offer, amount);

    if (rewardAmount.lessThanOrEqualTo(0) && offer.rewardType !== 'no_reward')
      return;

    let turnoverBaseAmount = rewardAmount;
    if (offer.turnoverBase === 'deposit_plus_bonus' && amount) {
      turnoverBaseAmount = rewardAmount.add(amount);
    } else if (offer.turnoverBase === 'deposit_only' && amount) {
      turnoverBaseAmount = amount;
    }
    const turnoverRequired = turnoverBaseAmount.mul(offer.turnoverMultiplier);

    const expiresAt = offer.bonusValidityDays
      ? new Date(Date.now() + offer.bonusValidityDays * 86_400_000)
      : null;

    await this.prisma.$transaction(async (tx) => {
      const currentOffer = await tx.offer.findUnique({
        where: { id: offer.id },
      });
      if (
        currentOffer?.totalBudget &&
        currentOffer.totalClaimed
          .add(rewardAmount)
          .greaterThan(currentOffer.totalBudget)
      ) {
        throw new Error('Offer budget exhausted');
      }

      let bonusWalletId: bigint | null = null;
      if (rewardAmount.greaterThan(0)) {
        const bw = await tx.bonusWallet.create({
          data: {
            userId: trigger.userId,
            type: offer.slug,
            amount: rewardAmount,
            turnoverRequired,
            expiresAt,
            eligibleGames: offer.eligibleGames as Prisma.InputJsonValue,
            metadata: {
              offerId: offer.id.toString(),
              triggerType: trigger.type,
            },
          },
        });
        bonusWalletId = bw.id;

        // Credited to real balance immediately — the turnover requirement
        // above still gates withdrawal (see BonusService.canWithdraw), it
        // no longer gates whether the player can see/use the money.
        await tx.user.update({
          where: { id: trigger.userId },
          data: { balance: { increment: rewardAmount } },
        });
      }

      await tx.offerClaim.create({
        data: {
          offerId: offer.id,
          userId: trigger.userId,
          bonusWalletId,
          triggerAmount: 'amount' in trigger ? trigger.amount : null,
          rewardAmount,
          // Plain JSON only — Decimal/bigint values must be stringified
          // before going into a Json column, so this can't be a raw spread.
          metadata: {
            trigger: {
              type: trigger.type,
              userId: trigger.userId.toString(),
              ...('amount' in trigger && trigger.amount
                ? { amount: trigger.amount.toString() }
                : {}),
              ...('depositCount' in trigger
                ? { depositCount: trigger.depositCount }
                : {}),
              ...('newLevel' in trigger ? { newLevel: trigger.newLevel } : {}),
              ...('tier' in trigger ? { tier: trigger.tier } : {}),
              ...('offerId' in trigger
                ? { offerId: trigger.offerId.toString() }
                : {}),
            },
            offerSnapshot: {
              slug: offer.slug,
              rewardType: offer.rewardType,
              turnoverMultiplier: offer.turnoverMultiplier.toString(),
            },
          },
        },
      });

      await tx.offer.update({
        where: { id: offer.id },
        data: {
          claimCount: { increment: 1 },
          totalClaimed: { increment: rewardAmount },
        },
      });
    });

    if (rewardAmount.greaterThan(0)) {
      this.balanceService.notifyChanged(trigger.userId);
      await this.notificationService.create(trigger.userId, 'offer_bonus', {
        amount: rewardAmount.toString(),
        offerSlug: offer.slug,
      });
    }
  }
}
