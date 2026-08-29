import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetWithdrawPasswordDto {
  // Required only when the player already has a withdrawal password set —
  // AuthService.setWithdrawPassword enforces that, since a brand-new
  // password has nothing to check it against yet.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  oldPassword?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword: string;
}
