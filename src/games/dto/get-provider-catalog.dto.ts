import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetProviderCatalogDto {
  @IsString()
  code: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  pageSize: number = 300;

  @IsOptional()
  @IsIn(['name_asc', 'name_desc', 'featured'])
  sort?: 'name_asc' | 'name_desc' | 'featured';
}
