import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SetGameOverrideDto {
  // Empty string / omitted clears this field — see GamesService.adminSetGameOverride.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  overrideGameUid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideThumbnail?: string;

  // Cached for display if this game later disappears from Oracle's own
  // catalog — passed straight through from what the CRM's list already
  // showed, not re-entered by staff.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerName?: string;
}
