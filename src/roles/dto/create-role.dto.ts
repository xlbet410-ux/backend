import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsBoolean()
  canApprove?: boolean;

  @IsArray()
  @IsString({ each: true })
  pages: string[];
}
