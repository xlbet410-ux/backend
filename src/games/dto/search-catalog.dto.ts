import { IsString, MinLength } from 'class-validator';

export class SearchCatalogQueryDto {
  @IsString()
  @MinLength(2)
  q: string;
}
