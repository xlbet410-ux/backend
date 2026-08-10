import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
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
  @IsNumberString()
  agentId: string;

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
}
