import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendAgentMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsString()
  staffUsername: string;
}
