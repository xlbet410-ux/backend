import { IsNumber, IsOptional, IsPositive, IsString, Min, MaxLength } from 'class-validator';

export class RequestSettlementDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  // Agent-editable share of the platform's outstanding balance being
  // settled alongside this request. Omitted = defaults to the full
  // requestable platform balance (see AgentsService.requestSettlement).
  // 0 is valid (settle none of it, leaving it all "due" for next time).
  @IsOptional()
  @IsNumber()
  @Min(0)
  platformAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
