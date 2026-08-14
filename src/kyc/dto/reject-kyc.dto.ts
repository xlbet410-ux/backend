import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectKycDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  reviewerUsername: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
