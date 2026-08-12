import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateVipTierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nameBn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nameEn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  requiredDeposit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  requiredBet?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bonusAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  turnoverMultiplier?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  bonusValidityDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  referralSignupBonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  referralBetCommissionPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyCashbackPct?: number;
}
