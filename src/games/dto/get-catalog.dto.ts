import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { GAME_CATEGORIES, SUB_TAGS } from '../catalog.types';
import type { GameCategory, SubTag } from '../catalog.types';

const CATALOG_SORTS = ['name_asc', 'name_desc', 'featured'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

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

  @IsOptional()
  @IsString()
  providerCode?: string;

  @IsOptional()
  @IsEnum(CATALOG_SORTS)
  sort?: CatalogSort;
}

export class GetSubTagCountsQueryDto {
  @IsEnum(GAME_CATEGORIES)
  category: GameCategory;
}
