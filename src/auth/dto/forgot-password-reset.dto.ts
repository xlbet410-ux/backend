import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class ForgotPasswordResetDto {
  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword: string;
}
