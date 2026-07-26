import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyKycDto {
  @IsString()
  @IsNotEmpty()
  reviewerUsername: string;
}
