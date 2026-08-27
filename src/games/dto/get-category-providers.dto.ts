import { IsEnum } from 'class-validator';
import { GAME_CATEGORIES } from '../catalog.types';
import type { GameCategory } from '../catalog.types';

export class GetCategoryProvidersDto {
  @IsEnum(GAME_CATEGORIES)
  category: GameCategory;
}
