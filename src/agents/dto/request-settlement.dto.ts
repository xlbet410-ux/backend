import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class RequestSettlementDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
