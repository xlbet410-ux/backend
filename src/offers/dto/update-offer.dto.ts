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
import {
  OFFER_CATEGORIES,
  OFFER_REWARD_TYPES,
  OFFER_TRIGGER_TYPES,
  OFFER_TURNOVER_BASES,
} from './create-offer.dto';

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, - and _',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  titleBn?: string;

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

  @IsOptional()
  @IsIn(OFFER_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsIn(OFFER_TRIGGER_TYPES)
  triggerType?: string;

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

  @IsOptional()
  @IsIn(OFFER_REWARD_TYPES)
  rewardType?: string;

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

  @IsOptional()
  @IsObject()
  eligibleGames?: Record<string, unknown>;
}
