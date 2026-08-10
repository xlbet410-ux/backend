import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { RejectKycDto } from './dto/reject-kyc.dto';
import { OffersService } from '../offers/offers.service';

// Deliberately NOT under the statically-served `uploads/` directory (see main.ts) —
// these are government ID photos and selfies, so they must only ever be reachable
// through the guarded /kyc/:id/image/:side route below, never as a public static file.
const PRIVATE_UPLOAD_DIR = join(process.cwd(), 'private-uploads', 'kyc');
const ALLOWED_MIME_TYPES = ['image/jpeg'];
const SIDES = ['front', 'back', 'selfie'] as const;
type Side = (typeof SIDES)[number];

type KycFiles = {
  front?: Express.Multer.File[];
  back?: Express.Multer.File[];
  selfie?: Express.Multer.File[];
};

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
  ) {}

  private toMine(
    row: {
      documentType: string;
      status: string;
      rejectReason: string | null;
      submittedAt: Date;
      reviewedAt: Date | null;
    } | null,
  ) {
    if (!row) return null;
    return {
      status: row.status,
      documentType: row.documentType,
      submittedAt: row.submittedAt.toISOString(),
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      rejectReason: row.rejectReason,
    };
  }

  private toAdmin(row: {
    id: bigint;
    userId: bigint;
    documentType: string;
    status: string;
    rejectReason: string | null;
    submittedAt: Date;
    reviewedAt: Date | null;
    user: { fullName: string; phoneNumber: string };
    reviewer: { username: string } | null;
  }) {
    return {
      id: row.id.toString(),
      userId: row.userId.toString(),
      fullName: row.user.fullName,
      phoneNumber: row.user.phoneNumber,
      documentType: row.documentType,
      status: row.status,
      rejectReason: row.rejectReason,
      submittedAt: row.submittedAt.toISOString(),
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      reviewedBy: row.reviewer?.username ?? null,
    };
  }

  async findMine(userId: string) {
    const row = await this.prisma.kycVerification.findUnique({
      where: { userId: BigInt(userId) },
    });
    return this.toMine(row);
  }

  async findAll() {
    const rows = await this.prisma.kycVerification.findMany({
      include: { user: true, reviewer: true },
      orderBy: { submittedAt: 'desc' },
    });
    return rows.map((r) => this.toAdmin(r));
  }

  async submit(userId: string, dto: SubmitKycDto, files: KycFiles) {
    const front = files.front?.[0];
    const back = files.back?.[0];
    const selfie = files.selfie?.[0];
    if (!front || !back || !selfie) {
      throw new BadRequestException(
        'Front, back, and selfie photos are all required.',
      );
    }
    for (const file of [front, back, selfie]) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException(
          'Only JPEG photos captured via the camera are accepted.',
        );
      }
    }

    const existing = await this.prisma.kycVerification.findUnique({
      where: { userId: BigInt(userId) },
    });
    if (existing && existing.status !== 'rejected') {
      throw new ConflictException(
        existing.status === 'pending'
          ? 'Your verification is already pending review.'
          : 'You are already verified.',
      );
    }

    const userDir = join(PRIVATE_UPLOAD_DIR, userId);
    await mkdir(userDir, { recursive: true });
    await Promise.all([
      writeFile(join(userDir, 'front.jpg'), front.buffer),
      writeFile(join(userDir, 'back.jpg'), back.buffer),
      writeFile(join(userDir, 'selfie.jpg'), selfie.buffer),
    ]);

    const data = {
      documentType: dto.documentType,
      documentFrontUrl: `${userId}/front.jpg`,
      documentBackUrl: `${userId}/back.jpg`,
      selfieUrl: `${userId}/selfie.jpg`,
      status: 'pending',
      rejectReason: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: new Date(),
    };

    const row = await this.prisma.kycVerification.upsert({
      where: { userId: BigInt(userId) },
      create: { userId: BigInt(userId), ...data },
      update: data,
    });
    return this.toMine(row);
  }

  async getImageStream(id: string, side: string) {
    if (!SIDES.includes(side as Side)) {
      throw new BadRequestException('Invalid image side.');
    }
    const row = await this.prisma.kycVerification.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) {
      throw new NotFoundException('KYC submission not found.');
    }
    const relativePath =
      side === 'front'
        ? row.documentFrontUrl
        : side === 'back'
          ? row.documentBackUrl
          : row.selfieUrl;
    const stream = createReadStream(join(PRIVATE_UPLOAD_DIR, relativePath));
    return { stream, contentType: 'image/jpeg' };
  }

  async verify(id: string, dto: VerifyKycDto) {
    const row = await this.prisma.kycVerification.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) {
      throw new NotFoundException('KYC submission not found.');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('This submission has already been reviewed.');
    }
    const reviewer = await this.prisma.account.findUnique({
      where: { username: dto.reviewerUsername },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer account not found.');
    }

    await this.prisma.kycVerification.update({
      where: { id: row.id },
      data: {
        status: 'verified',
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
        rejectReason: null,
      },
    });

    // Never let a broken offer definition block a real KYC approval.
    try {
      await this.offersService.processTrigger({
        type: 'kyc_approved',
        userId: row.userId,
      });
    } catch (err) {
      this.logger.error(
        `Offer trigger failed for user ${row.userId}: ${(err as Error).message}`,
      );
    }

    return { success: true };
  }

  async reject(id: string, dto: RejectKycDto) {
    const row = await this.prisma.kycVerification.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) {
      throw new NotFoundException('KYC submission not found.');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('This submission has already been reviewed.');
    }
    const reviewer = await this.prisma.account.findUnique({
      where: { username: dto.reviewerUsername },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer account not found.');
    }

    await this.prisma.kycVerification.update({
      where: { id: row.id },
      data: {
        status: 'rejected',
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
        rejectReason: dto.reason,
      },
    });
    return { success: true };
  }
}
