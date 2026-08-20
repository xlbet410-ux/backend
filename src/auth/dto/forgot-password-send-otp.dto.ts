import { Matches } from 'class-validator';

export class ForgotPasswordSendOtpDto {
  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;
}
