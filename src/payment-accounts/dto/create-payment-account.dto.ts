import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const PAYMENT_METHODS = [
  'bkash',
  'nagad',
  'rocket',
  'upay',
  'surecash',
  'crypto',
  'bank',
] as const;

export class CreatePaymentAccountDto {
  @IsIn(PAYMENT_METHODS)
  method: string;

  @IsString()
  @MinLength(2)
  label: string;

  @IsString()
  @MinLength(3)
  accountNumber: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commission?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accountLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyEarn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyCollect?: number;
}
