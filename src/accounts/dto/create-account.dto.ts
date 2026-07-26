import { IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(4)
  password: string;

  @IsString()
  roleId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}
