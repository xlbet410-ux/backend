import { IsString, Length, Matches } from 'class-validator';

export class ForgotPasswordVerifyOtpDto {
  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  @IsString()
  @Length(4, 8)
  code: string;
}
