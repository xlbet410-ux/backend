import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class ManualOverrideDto {
  @IsString()
  userId!: string;

  @IsInt()
  @Min(0)
  @Max(50)
  level!: number;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsString()
  @MinLength(1)
  overrideBy!: string;
}
