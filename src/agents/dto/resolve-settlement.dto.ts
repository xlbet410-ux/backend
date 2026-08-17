import { IsString } from 'class-validator';

export class ResolveSettlementDto {
  @IsString()
  confirmedByUsername: string;
}
