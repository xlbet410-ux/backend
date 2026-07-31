import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GAME_CATEGORIES, SUB_TAGS } from '../catalog.types';
import type { GameCategory, SubTag } from '../catalog.types';

export class GetCatalogQueryDto {
  @IsEnum(GAME_CATEGORIES)
  category: GameCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize: number = 18;

  @IsOptional()
  @IsEnum(SUB_TAGS)
  tag?: SubTag;
}

export class GetSubTagCountsQueryDto {
  @IsEnum(GAME_CATEGORIES)
  category: GameCategory;
}
