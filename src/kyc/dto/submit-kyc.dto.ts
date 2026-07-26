import { IsIn } from 'class-validator';

export const DOCUMENT_TYPES = ['nid', 'passport', 'license'] as const;

export class SubmitKycDto {
  @IsIn(DOCUMENT_TYPES)
  documentType: (typeof DOCUMENT_TYPES)[number];
}
