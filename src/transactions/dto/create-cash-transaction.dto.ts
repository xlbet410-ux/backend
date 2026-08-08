import { IsIn, IsNumber, IsString, Min, MinLength } from 'class-validator';

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
}
