import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsBoolean()
  canApprove?: boolean;

  // Omit to leave page access unchanged; pass the full replacement list to
  // change it — same all-or-nothing shape the create form already uses.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pages?: string[];
}
