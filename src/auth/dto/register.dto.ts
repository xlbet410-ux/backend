import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;

  // Captured silently from a ?agent=CODE signup link — see
  // AgentsService.linkAgentReferral. Not a player-facing field, no visible
  // input for it in the UI.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  agentCode?: string;

  @IsOptional()
  @IsBoolean()
  isAdult?: boolean;

  @IsBoolean()
  agreedTerms: boolean;
}
