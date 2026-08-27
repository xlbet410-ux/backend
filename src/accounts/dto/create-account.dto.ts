import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(3)
  username: string;

  // Optional — an account with no password set can't log in yet, but can
  // still exist and be managed by admins (mirrors Agent creation).
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsString()
  roleId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}
