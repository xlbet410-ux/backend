import { IsString, MinLength } from 'class-validator';

export class ChangeAccountPasswordDto {
  @IsString()
  username: string;

  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(4)
  newPassword: string;
}
