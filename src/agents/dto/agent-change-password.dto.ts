import { IsString, MinLength } from 'class-validator';

export class AgentChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(4)
  newPassword: string;
}
