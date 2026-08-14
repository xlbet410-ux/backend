import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyKycDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  reviewerUsername: string;
}
