import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
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
// How often to re-check recurring offers (e.g. Members Day) for whether
// their startsAt/endsAt window needs rolling forward to the next
// occurrence — matches GamesService's established periodic-refresh pattern
// elsewhere in this codebase (no new scheduler dependency needed).
const RECURRING_OFFER_REFRESH_MS = 30 * 60 * 1000;

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
export class OffersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OffersService.name);
  private recurringOfferTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly balanceService: BalanceService,
  ) {}

  onModuleInit(): void {
    void this.refreshRecurringOffers();
    this.recurringOfferTimer = setInterval(() => {
      void this.refreshRecurringOffers();
    }, RECURRING_OFFER_REFRESH_MS);
  }

  onModuleDestroy(): void {
    if (this.recurringOfferTimer) clearInterval(this.recurringOfferTimer);
  }

  // Rolls startsAt/endsAt forward for any offer with recurringMonthDays set
  // (e.g. Members Day's [1, 11, 21]) so it auto-covers "today" when today is
  // one of those days, or the next upcoming one otherwise — no admin needs
  // to hand-edit the schedule window every month. Only writes when the
  // computed window actually differs from what's stored, so this is a
  // no-op most ticks.
  private async refreshRecurringOffers(): Promise<void> {
    try {
      const offers = await this.prisma.offer.findMany({
        where: { isActive: true, recurringMonthDays: { not: Prisma.DbNull } },
      });

      const now = new Date();
      for (const offer of offers) {
        const days = this.parseMonthDays(offer.recurringMonthDays);
        if (days.length === 0) continue;

        const { start, end } = this.nextOccurrenceWindow(days, now);
        const unchanged =
          offer.startsAt?.getTime() === start.getTime() &&
          offer.endsAt?.getTime() === end.getTime();
        if (unchanged) continue;

        await this.prisma.offer.update({
          where: { id: offer.id },
          data: { startsAt: start, endsAt: end },
        });
        this.logger.log(
          `Rolled recurring offer "${offer.slug}" window to ${start.toISOString()} - ${end.toISOString()}`,
        );
      }
    } catch (err) {
      this.logger.error('Failed to refresh recurring offer windows', err);
    }
  }

  private parseMonthDays(value: Prisma.JsonValue | null): number[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  }

  // Given e.g. [1, 11, 21] and "now": if today is one of those days, the
  // window covers today (start-of-day to end-of-day); otherwise it covers
  // the next configured day, rolling into next month if none remain in the
  // current one.
  private nextOccurrenceWindow(
    monthDays: number[],
    now: Date,
  ): { start: Date; end: Date } {
    const sorted = [...monthDays].sort((a, b) => a - b);
    const dayOf = (year: number, month: number, day: number) => ({
      start: new Date(year, month, day, 0, 0, 0, 0),
      end: new Date(year, month, day, 23, 59, 59, 999),
    });

    const today = now.getDate();
    if (sorted.includes(today)) {
      return dayOf(now.getFullYear(), now.getMonth(), today);
    }

    const nextThisMonth = sorted.find((d) => d > today);
    if (nextThisMonth !== undefined) {
      return dayOf(now.getFullYear(), now.getMonth(), nextThisMonth);
    }

    const nextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
    const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    return dayOf(year, nextMonth, sorted[0]);
  }

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
      stepsToClaimBn: offer.stepsToClaimBn,
      stepsToClaimEn: offer.stepsToClaimEn,
      bonusInfoBn: offer.bonusInfoBn,
      bonusInfoEn: offer.bonusInfoEn,
      imageOnly: offer.imageOnly,
      groupKey: offer.groupKey,
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
      rewardMin: offer.rewardMin?.toString() ?? null,
      rewardMax: offer.rewardMax?.toString() ?? null,
      rewardDistribution: offer.rewardDistribution,
      turnoverMultiplier: offer.turnoverMultiplier.toString(),
      turnoverBase: offer.turnoverBase,
      claimWindow: offer.claimWindow,
      eligibleGames: offer.eligibleGames,
      bonusValidityDays: offer.bonusValidityDays,
      totalBudget: offer.totalBudget?.toString() ?? null,
      totalClaimed: offer.totalClaimed.toString(),
      dailyBudgetCap: offer.dailyBudgetCap?.toString() ?? null,
      dailyClaimCap: offer.dailyClaimCap,
      recurringMonthDays: offer.recurringMonthDays,
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
        rewardDistribution: dto.rewardDistribution as
          Prisma.InputJsonValue | undefined,
        recurringMonthDays: dto.recurringMonthDays as
          Prisma.InputJsonValue | undefined,
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
        rewardDistribution: dto.rewardDistribution as
          Prisma.InputJsonValue | undefined,
        recurringMonthDays: dto.recurringMonthDays as
          Prisma.InputJsonValue | undefined,
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
        imageOnly: existing.imageOnly,
        // Deliberately NOT copied: groupKey — a duplicate joining the same
        // group silently (without the admin explicitly setting it) would
        // just add a near-identical extra card to that group's "+N more".
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
        rewardMin: existing.rewardMin,
        rewardMax: existing.rewardMax,
        rewardDistribution: existing.rewardDistribution as
          Prisma.InputJsonValue | undefined,
        turnoverMultiplier: existing.turnoverMultiplier,
        turnoverBase: existing.turnoverBase,
        claimWindow: existing.claimWindow,
        bonusValidityDays: existing.bonusValidityDays,
        eligibleGames: existing.eligibleGames as Prisma.InputJsonValue,
        totalBudget: existing.totalBudget,
        dailyBudgetCap: existing.dailyBudgetCap,
        dailyClaimCap: existing.dailyClaimCap,
        recurringMonthDays: existing.recurringMonthDays as
          Prisma.InputJsonValue | undefined,
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

    // Batched claim counts instead of one query per offer: split by
    // claimWindow (the WHERE shape differs — 'daily' adds a claimedAt
    // filter) and groupBy offerId within each, so this is 0-2 queries total
    // for the whole list instead of one per offer.
    const claimCountByOfferId = new Map<string, number>();
    if (userId) {
      const dailyIds: bigint[] = [];
      const lifetimeIds: bigint[] = [];
      for (const offer of offers) {
        (offer.claimWindow === 'daily' ? dailyIds : lifetimeIds).push(offer.id);
      }
      const [dailyCounts, lifetimeCounts] = await Promise.all([
        dailyIds.length
          ? this.prisma.offerClaim.groupBy({
              by: ['offerId'],
              where: { userId, offerId: { in: dailyIds }, claimedAt: { gte: this.startOfToday() } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        lifetimeIds.length
          ? this.prisma.offerClaim.groupBy({
              by: ['offerId'],
              where: { userId, offerId: { in: lifetimeIds } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ]);
      for (const row of [...dailyCounts, ...lifetimeCounts]) {
        claimCountByOfferId.set(row.offerId.toString(), row._count._all);
      }
    }

    const result: Array<Record<string, unknown>> = [];
    for (const offer of offers) {
      const claims = claimCountByOfferId.get(offer.id.toString()) ?? 0;
      const alreadyClaimed = claims >= offer.maxClaimsPerUser;

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
        stepsToClaimBn: offer.stepsToClaimBn,
        stepsToClaimEn: offer.stepsToClaimEn,
        bonusInfoBn: offer.bonusInfoBn,
        bonusInfoEn: offer.bonusInfoEn,
        imageOnly: offer.imageOnly,
        groupKey: offer.groupKey,
        category: offer.category,
        triggerType: offer.triggerType,
        rewardType: offer.rewardType,
        rewardAmount: offer.rewardAmount?.toString() ?? null,
        rewardCap: offer.rewardCap?.toString() ?? null,
        rewardMin: offer.rewardMin?.toString() ?? null,
        rewardMax: offer.rewardMax?.toString() ?? null,
        turnoverMultiplier: offer.turnoverMultiplier.toString(),
        bonusValidityDays: offer.bonusValidityDays,
        alreadyClaimed,
        eligible,
        priority: offer.priority,
      });
    }
    return result;
  }

  /**
   * Active, in-window offers sharing a groupKey — independent of
   * showInPromotionsPage, unlike listForUser, so a dedicated page (e.g. the
   * Referral Program page's milestone ladder) can read a group of offers
   * that are deliberately kept off the general Promotions grid. Ascending
   * priority, since a ladder like the milestone offers uses priority ==
   * the tier number and should read low-to-high, the opposite of every
   * other priority-ordered list in this file.
   */
  async getOffersByGroupKey(groupKey: string) {
    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        groupKey,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { priority: 'asc' },
    });

    return offers.map((offer) => ({
      id: offer.id.toString(),
      slug: offer.slug,
      titleBn: offer.titleBn,
      titleEn: offer.titleEn,
      descriptionBn: offer.descriptionBn,
      descriptionEn: offer.descriptionEn,
      triggerType: offer.triggerType,
      triggerConfig: offer.triggerConfig,
      rewardType: offer.rewardType,
      rewardAmount: offer.rewardAmount?.toString() ?? null,
      rewardCap: offer.rewardCap?.toString() ?? null,
      turnoverMultiplier: offer.turnoverMultiplier.toString(),
      bonusValidityDays: offer.bonusValidityDays,
      maxClaimsPerUser: offer.maxClaimsPerUser,
      termsBn: offer.termsBn,
      termsEn: offer.termsEn,
    }));
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
      imageOnly: offer.imageOnly,
      rewardType: offer.rewardType,
      rewardAmount: offer.rewardAmount?.toString() ?? null,
      rewardCap: offer.rewardCap?.toString() ?? null,
      rewardMin: offer.rewardMin?.toString() ?? null,
      rewardMax: offer.rewardMax?.toString() ?? null,
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

    // Batched instead of one offerClaim query per offer — same approach as
    // listForUser (split by claimWindow, groupBy offerId).
    const claimCountByOfferId = new Map<string, number>();
    if (offers.length) {
      const dailyIds = offers.filter((o) => o.claimWindow === 'daily').map((o) => o.id);
      const lifetimeIds = offers.filter((o) => o.claimWindow !== 'daily').map((o) => o.id);
      const [dailyCounts, lifetimeCounts] = await Promise.all([
        dailyIds.length
          ? this.prisma.offerClaim.groupBy({
              by: ['offerId'],
              where: { userId, offerId: { in: dailyIds }, claimedAt: { gte: this.startOfToday() } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        lifetimeIds.length
          ? this.prisma.offerClaim.groupBy({
              by: ['offerId'],
              where: { userId, offerId: { in: lifetimeIds } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ]);
      for (const row of [...dailyCounts, ...lifetimeCounts]) {
        claimCountByOfferId.set(row.offerId.toString(), row._count._all);
      }
    }
    // Same value regardless of which offer is being checked — computed once
    // instead of re-querying inside the loop for every nth_deposit offer.
    let depositCount: number | null = null;

    const applicable: Array<Record<string, unknown>> = [];
    for (const offer of offers) {
      if (offer.minDeposit && amount.lessThan(offer.minDeposit)) continue;
      if (offer.maxDeposit && amount.greaterThan(offer.maxDeposit)) continue;
      if (offer.requiredVipLevel && user.vipLevel < offer.requiredVipLevel)
        continue;
      if (offer.requiresKyc && user.kycVerification?.status !== 'verified')
        continue;

      const claims = claimCountByOfferId.get(offer.id.toString()) ?? 0;
      if (claims >= offer.maxClaimsPerUser) continue;

      if (
        offer.totalBudget &&
        offer.totalClaimed.greaterThanOrEqualTo(offer.totalBudget)
      ) {
        continue;
      }

      if (offer.triggerType === 'nth_deposit') {
        const nth = (offer.triggerConfig as { nth?: number } | null)?.nth;
        if (depositCount === null) {
          depositCount = await this.prisma.cashTransaction.count({
            where: { userId, type: 'cash_in', status: 'completed' },
          });
        }
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
        termsEn: offer.termsEn,
      });
    }

    return applicable;
  }

  private calculateReward(
    offer: {
      rewardType: string;
      rewardAmount: Prisma.Decimal | null;
      rewardCap: Prisma.Decimal | null;
      rewardMin?: Prisma.Decimal | null;
      rewardMax?: Prisma.Decimal | null;
      rewardDistribution?: Prisma.JsonValue;
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
    if (offer.rewardType === 'random') {
      const weighted = this.pickWeightedReward(offer.rewardDistribution);
      if (weighted !== null) return weighted;

      const min = offer.rewardMin ?? new Prisma.Decimal(0);
      const max = offer.rewardMax ?? min;
      if (max.lessThanOrEqualTo(min)) return min;
      // Whole-taka granularity — a "৳100-999" style random envelope reward
      // doesn't need paisa-level precision, and rounding to whole units
      // keeps the displayed amount clean.
      const span = max.sub(min).toNumber();
      const roll = Math.floor(Math.random() * (span + 1));
      return min.add(roll);
    }
    return new Prisma.Decimal(0);
  }

  // Optional weighted prize table (e.g. mostly-small, rarely-big envelope
  // amounts) — [{amount, weight}, ...]. Returns null (falls back to the
  // uniform rewardMin/rewardMax range) when absent or malformed.
  private pickWeightedReward(
    distribution: Prisma.JsonValue | undefined,
  ): Prisma.Decimal | null {
    if (!Array.isArray(distribution) || distribution.length === 0) return null;

    const entries: { amount: number; weight: number }[] = [];
    for (const raw of distribution) {
      if (typeof raw !== 'object' || raw === null) continue;
      const amount = Number((raw as Record<string, unknown>).amount);
      const weight = Number((raw as Record<string, unknown>).weight);
      if (Number.isFinite(amount) && Number.isFinite(weight) && weight > 0) {
        entries.push({ amount, weight });
      }
    }
    if (entries.length === 0) return null;

    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of entries) {
      if (roll < entry.weight) return new Prisma.Decimal(entry.amount);
      roll -= entry.weight;
    }
    return new Prisma.Decimal(entries[entries.length - 1].amount);
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // 'daily' claimWindow counts only today's claims (so maxClaimsPerUser=1
  // means "once per calendar day"); 'lifetime' (default) counts every claim
  // ever, unchanged from the original behavior.
  private claimCountWhere(
    offerId: bigint,
    userId: bigint,
    claimWindow: string,
  ): Prisma.OfferClaimWhereInput {
    if (claimWindow !== 'daily') return { offerId, userId };
    return { offerId, userId, claimedAt: { gte: this.startOfToday() } };
  }

  // Today's cumulative claim count + amount distributed for an offer with a
  // dailyBudgetCap/dailyClaimCap — resets implicitly at local midnight since
  // it's a live query over claimedAt, not a stored counter that needs a
  // cron to reset. See Offer.dailyBudgetCap/dailyClaimCap in schema.prisma.
  private async todaysDistributed(
    client: Prisma.TransactionClient | PrismaService,
    offerId: bigint,
  ): Promise<{ count: number; total: Prisma.Decimal }> {
    const agg = await client.offerClaim.aggregate({
      where: { offerId, claimedAt: { gte: this.startOfToday() } },
      _count: { _all: true },
      _sum: { rewardAmount: true },
    });
    return {
      count: agg._count._all,
      total: agg._sum.rewardAmount ?? new Prisma.Decimal(0),
    };
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
      where: this.claimCountWhere(offer.id, trigger.userId, offer.claimWindow),
    });
    if (claims >= offer.maxClaimsPerUser) return false;

    if (offer.dailyBudgetCap || offer.dailyClaimCap) {
      const today = await this.todaysDistributed(this.prisma, offer.id);
      if (offer.dailyClaimCap && today.count >= offer.dailyClaimCap)
        return false;
      if (
        offer.dailyBudgetCap &&
        today.total.greaterThanOrEqualTo(offer.dailyBudgetCap)
      )
        return false;
    }

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

      // Re-verified here, inside the transaction, on top of the same check
      // already done in matchesConditions before this ran — closes the race
      // window between two concurrent claims both passing that first check
      // before either one's claim row exists yet. This is the actual
      // double-payment guard, not just the earlier pre-check.
      const claimsSoFar = await tx.offerClaim.count({
        where: this.claimCountWhere(offer.id, trigger.userId, offer.claimWindow),
      });
      if (claimsSoFar >= offer.maxClaimsPerUser) {
        throw new Error('Already claimed');
      }

      // Same re-verification principle as the budget/claim checks above,
      // applied to the daily-resetting caps (e.g. Red Envelope Rain's daily
      // pool) — the pre-check in matchesConditions has the same race window
      // between two concurrent claims.
      if (currentOffer?.dailyClaimCap || currentOffer?.dailyBudgetCap) {
        const today = await this.todaysDistributed(tx, offer.id);
        if (
          currentOffer.dailyClaimCap &&
          today.count >= currentOffer.dailyClaimCap
        ) {
          throw new Error('Daily claim cap reached');
        }
        if (
          currentOffer.dailyBudgetCap &&
          today.total.add(rewardAmount).greaterThan(currentOffer.dailyBudgetCap)
        ) {
          throw new Error('Daily budget cap reached');
        }
      }

      let bonusWalletId: bigint | null = null;
      if (rewardAmount.greaterThan(0)) {
        if (turnoverRequired.greaterThan(0)) {
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
        }
        // Credited to real balance immediately — if there's a turnover
        // requirement it still gates withdrawal via the BonusWallet above
        // (see BonusService.canWithdraw), not whether the player can
        // see/use the money. An offer with turnoverMultiplier=0 (real cash,
        // no restrictions — e.g. a referral milestone bonus) skips the
        // BonusWallet entirely and never locks anything.
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
