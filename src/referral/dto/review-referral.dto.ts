import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ReviewReferralDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsString()
  @MinLength(1)
  reviewedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
