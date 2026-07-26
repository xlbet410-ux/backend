import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectKycDto {
  @IsString()
  @IsNotEmpty()
  reviewerUsername: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
