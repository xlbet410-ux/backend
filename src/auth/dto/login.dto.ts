import { IsString, MaxLength, Matches } from 'class-validator';

export class LoginDto {
  @Matches(/^\+?\d{7,20}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
