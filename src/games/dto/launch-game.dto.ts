import { IsNotEmpty, IsString } from 'class-validator';

export class LaunchGameDto {
  @IsString()
  @IsNotEmpty()
  gameUid: string;
}
