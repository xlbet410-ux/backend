import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../../payment-accounts/dto/create-payment-account.dto';

class InitialPaymentAccountDto {
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

export class CreateAgentDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  // Optional — an agent with no password set can't log in yet, but the
  // profile (and their numbers) can still exist and be managed by admins.
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

  // Lets the admin add the agent's first number(s) — same method or mixed
  // — in the same request that creates the profile.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialPaymentAccountDto)
  paymentAccounts?: InitialPaymentAccountDto[];
}
