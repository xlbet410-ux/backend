import {
  IsIn,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export const CASH_METHODS = [
  'bkash',
  'nagad',
  'rocket',
  'upay',
  'surecash',
  'crypto',
  'bank',
] as const;

export class CreateCashTransactionDto {
  @IsIn(CASH_METHODS)
  method: string;

  @IsNumber()
  @Min(100)
  amount: number;

  // Trx ID (cash-in) or destination account number (cash-out).
  @IsString()
  @MinLength(3)
  reference: string;

  // The exact agent account the player was shown and told to pay (cash-in
  // only) — if omitted, the backend falls back to auto-picking the first
  // active account for the method.
  @IsOptional()
  @IsNumberString()
  paymentAccountId?: string;
}
