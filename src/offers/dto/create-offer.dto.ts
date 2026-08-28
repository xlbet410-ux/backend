import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const OFFER_CATEGORIES = [
  'deposit',
  'referral',
  'level',
  'daily',
  'cashback',
  'special',
] as const;

export const OFFER_TRIGGER_TYPES = [
  'first_deposit',
  'nth_deposit',
  'every_deposit',
  'kyc_approved',
  'vip_levelup',
  'referral_milestone',
  'daily_login',
  'signup',
  'manual_claim',
] as const;

export const OFFER_REWARD_TYPES = ['fixed', 'percentage', 'no_reward', 'random'] as const;

export const OFFER_TURNOVER_BASES = [
  'bonus',
  'deposit_plus_bonus',
  'deposit_only',
] as const;

// 'lifetime' (default) — maxClaimsPerUser counts a player's claims ever.
// 'daily' — counts only today's claims, so maxClaimsPerUser=1 means "once
// per calendar day" (e.g. a recurring daily lucky-envelope claim). 'monthly'
// — counts only this calendar month's claims, so maxClaimsPerUser=1 means
// "once per calendar month" (e.g. a loss-threshold envelope tied to
// triggerConfig.monthlyPrincipalLoss — see OffersService.matchesConditions).
export const OFFER_CLAIM_WINDOWS = ['lifetime', 'daily', 'monthly'] as const;

export class CreateOfferDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, - and _',
  })
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titleBn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descriptionBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descriptionEn?: string;

  // Relative /uploads/... path from the offer image upload endpoint (same
  // convention as SliderImage/PromoImage), not a full URL — @IsUrl would
  // reject it.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrlEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrlEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  termsBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  termsEn?: string;

  // One step per line — rendered as the Detail popup's "Steps to Claim" list.
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  stepsToClaimBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  stepsToClaimEn?: string;

  // One "Label | Value" row per line — rendered as the Detail popup's
  // "Bonus Information" table.
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  bonusInfoBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  bonusInfoEn?: string;

  @IsOptional()
  @IsBoolean()
  imageOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupKey?: string;

  @IsIn(OFFER_CATEGORIES)
  category: string;

  @IsIn(OFFER_TRIGGER_TYPES)
  triggerType: string;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minDeposit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDeposit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  requiredVipLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  requiredAgentTier?: number;

  @IsOptional()
  @IsBoolean()
  requiresKyc?: boolean;

  @IsOptional()
  @IsBoolean()
  isNewUsersOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxClaimsPerUser?: number;

  @IsIn(OFFER_REWARD_TYPES)
  rewardType: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardCap?: number;

  // Only used when rewardType = 'random' — a fresh amount is picked
  // uniformly between these two on every claim.
  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  turnoverMultiplier?: number;

  @IsOptional()
  @IsIn(OFFER_TURNOVER_BASES)
  turnoverBase?: string;

  @IsOptional()
  @IsIn(OFFER_CLAIM_WINDOWS)
  claimWindow?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  bonusValidityDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalBudget?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyBudgetCap?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyClaimCap?: number;

  // [{ amount: number; weight: number }, ...] — shape enforced app-side,
  // same loose Json validation as triggerConfig/eligibleGames.
  @IsOptional()
  @IsArray()
  rewardDistribution?: Record<string, unknown>[];

  // Day-of-month values (1-31) this offer auto-recurs on, e.g. [1,11,21].
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(31)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  recurringMonthDays?: number[];

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  showInPromotionsPage?: boolean;

  @IsOptional()
  @IsBoolean()
  showInPopup?: boolean;

  @IsOptional()
  @IsInt()
  popupPriority?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  popupCtaTextBn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  popupCtaTextEn?: string;

  @IsOptional()
  @IsString()
  popupCtaLink?: string;

  // { mode: 'all' } | { mode: 'category'; category: GameCategory } |
  // { mode: 'specific'; games: { gameUid: string; name: string }[] } —
  // same loose Json validation as triggerConfig, shape enforced app-side.
  @IsOptional()
  @IsObject()
  eligibleGames?: Record<string, unknown>;
}
