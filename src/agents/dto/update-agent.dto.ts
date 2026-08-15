import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { AGENT_TYPES } from './create-agent.dto';

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

  @IsOptional()
  @IsIn(AGENT_TYPES)
  type?: string;
}
