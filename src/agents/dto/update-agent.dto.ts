import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber?: string;

  // Omit to leave the current password unchanged.
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
  @IsBoolean()
  isActive?: boolean;
}
