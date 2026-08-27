import { IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Length(4, 8)
  code: string;
}
