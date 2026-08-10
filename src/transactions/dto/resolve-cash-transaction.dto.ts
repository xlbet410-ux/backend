import { IsString, MinLength } from 'class-validator';

export class ResolveCashTransactionDto {
  @IsString()
  @MinLength(1)
  reviewerUsername: string;
}
