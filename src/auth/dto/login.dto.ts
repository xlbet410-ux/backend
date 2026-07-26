import { IsString, Matches } from 'class-validator';

export class LoginDto {
  @Matches(/^\+?\d{7,20}$/, { message: 'phoneNumber must be a valid phone number' })
  phoneNumber: string;

  @IsString()
  password: string;
}
