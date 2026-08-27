import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'Enter a valid phone number.' })
  phoneNumber: string;
}
