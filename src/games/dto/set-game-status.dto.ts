import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetGameStatusDto {
  @IsBoolean()
  isActive!: boolean;

  // Cached for display if this game later disappears from Oracle's own
  // catalog — same reasoning as SetGameOverrideDto.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerName?: string;
}
