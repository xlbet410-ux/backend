import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { imageSize } from 'image-size';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'promo');
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Injectable()
export class PromoImagesService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(row: {
    id: bigint;
    imageUrl: string;
    originalName: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id.toString(),
      imageUrl: row.imageUrl,
      originalName: row.originalName,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findAllActive() {
    const rows = await this.prisma.promoImage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async findAll() {
    const rows = await this.prisma.promoImage.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((r) => this.toPublic(r));
  }

  async upload(file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PNG, JPG, or WEBP images are supported.');
    }

    try {
      const { width, height } = imageSize(file.buffer);
      if (!width || !height) {
        throw new BadRequestException("Couldn't determine this image's dimensions.");
      }
    } catch {
      throw new BadRequestException("Couldn't read this image file. It may be corrupted.");
    }

    // Always re-encoded through sharp and always written as .webp — never
    // the client-supplied filename/extension. See SliderImagesService.upload
    // for why: otherwise a crafted file with valid-enough image header bytes
    // but a spoofed .html/.svg extension could be saved and served back with
    // an attacker-chosen Content-Type (stored XSS on this origin).
    let optimized: Buffer;
    try {
      optimized = await sharp(file.buffer).rotate().webp({ quality: 90 }).toBuffer();
    } catch {
      throw new BadRequestException("Couldn't read this image file. It may be corrupted.");
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    await writeFile(join(UPLOAD_DIR, filename), optimized);

    const maxSort = await this.prisma.promoImage.aggregate({ _max: { sortOrder: true } });
    const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

    const created = await this.prisma.promoImage.create({
      data: {
        imageUrl: `/uploads/promo/${filename}`,
        originalName: file.originalname,
        sortOrder: nextSort,
      },
    });
    return this.toPublic(created);
  }

  async remove(id: string) {
    const row = await this.prisma.promoImage.findUnique({ where: { id: BigInt(id) } });
    if (!row) {
      throw new NotFoundException('Image not found.');
    }

    await this.prisma.promoImage.delete({ where: { id: row.id } });

    const filePath = join(process.cwd(), row.imageUrl.replace(/^\//, ''));
    await unlink(filePath).catch(() => {});

    return { success: true };
  }
}
