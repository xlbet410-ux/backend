import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePaymentAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
