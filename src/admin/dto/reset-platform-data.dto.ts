import { IsString } from 'class-validator';

export class ResetPlatformDataDto {
  @IsString()
  confirm: string;
}
