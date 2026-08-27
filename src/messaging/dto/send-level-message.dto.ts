import { IsString, Matches, MinLength } from 'class-validator';

export class SendLevelMessageDto {
  // 'all', or a VIP level number (0-50) as a string — parsed in the
  // controller, since class-validator has no clean single-field union check.
  @Matches(/^(all|[0-9]{1,2})$/, {
    message: "level must be 'all' or a VIP level number (0-50)",
  })
  level: string;

  @IsString()
  @MinLength(1)
  message: string;
}
