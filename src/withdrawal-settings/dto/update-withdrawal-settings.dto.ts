import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateWithdrawalSettingsDto {
  @IsOptional()
  @IsBoolean()
  kycEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  withdrawPasswordEnabled?: boolean;
}
