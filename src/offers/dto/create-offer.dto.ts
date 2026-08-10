import {
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

export const OFFER_REWARD_TYPES = ['fixed', 'percentage', 'no_reward'] as const;

export const OFFER_TURNOVER_BASES = [
  'bonus',
  'deposit_plus_bonus',
  'deposit_only',
] as const;

export class CreateOfferDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, - and _',
  })
  slug: string;

  @IsString()
  @MinLength(1)
  titleBn: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  descriptionBn?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  // Relative /uploads/... path from the offer image upload endpoint (same
  // convention as SliderImage/PromoImage), not a full URL — @IsUrl would
  // reject it.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  termsBn?: string;

  @IsOptional()
  @IsString()
  termsEn?: string;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  turnoverMultiplier?: number;

  @IsOptional()
  @IsIn(OFFER_TURNOVER_BASES)
  turnoverBase?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  bonusValidityDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalBudget?: number;

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
}
