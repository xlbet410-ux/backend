import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

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

  // Omit to leave the current password unchanged — only ever hashed and
  // overwritten when a new value is actually provided.
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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
