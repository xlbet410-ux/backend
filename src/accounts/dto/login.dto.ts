import { IsString } from 'class-validator';

export class AccountLoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
