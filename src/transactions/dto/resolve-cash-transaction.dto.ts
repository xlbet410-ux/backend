import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Exactly one of these two identifies who's resolving the request — a
// staff Account (reviewerUsername) or an Agent approving a request tied to
// their own payment account (agentId). The service enforces that.
export class ResolveCashTransactionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  reviewerUsername?: string;

  @IsOptional()
  @IsNumberString()
  agentId?: string;
}
