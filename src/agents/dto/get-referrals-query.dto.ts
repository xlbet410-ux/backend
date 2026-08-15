import { IsIn, IsOptional, Matches } from 'class-validator';

export const REFERRAL_PERIODS = ['day', 'week', 'month'] as const;

export class GetReferralsQueryDto {
  @IsOptional()
  @IsIn(REFERRAL_PERIODS)
  period?: 'day' | 'week' | 'month';

  // Only meaningful with period=day — an explicit calendar date to look at
  // instead of today.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;
}
