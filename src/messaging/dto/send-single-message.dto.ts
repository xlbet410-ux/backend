import { IsString, Matches, MinLength } from 'class-validator';

export class SendSingleMessageDto {
  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  @IsString()
  @MinLength(1)
  message: string;
}
