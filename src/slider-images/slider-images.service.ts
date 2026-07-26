import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { imageSize } from 'image-size';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'slider');
const TARGET_RATIO = 16 / 7;
const RATIO_TOLERANCE = 0.05;
const MIN_WIDTH = 1152;
const MIN_HEIGHT = 504;
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Injectable()
export class SliderImagesService {
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
    const rows = await this.prisma.sliderImage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async findAll() {
    const rows = await this.prisma.sliderImage.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((r) => this.toPublic(r));
  }

  async upload(file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PNG, JPG, or WEBP images are supported.');
    }

    let width: number | undefined;
    let height: number | undefined;
    try {
      ({ width, height } = imageSize(file.buffer));
    } catch {
      throw new BadRequestException("Couldn't read this image file. It may be corrupted.");
    }
    if (!width || !height) {
      throw new BadRequestException("Couldn't determine this image's dimensions.");
    }
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      throw new BadRequestException(
        `Image is too small (${width}×${height}px). Minimum size is ${MIN_WIDTH}×${MIN_HEIGHT}px.`,
      );
    }
    const ratio = width / height;
    if (Math.abs(ratio - TARGET_RATIO) > RATIO_TOLERANCE) {
      throw new BadRequestException(
        `Image is ${width}×${height}px, which doesn't match the slider's 16:7 ratio. Recommended size: 1600×700px.`,
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await writeFile(join(UPLOAD_DIR, filename), file.buffer);

    const maxSort = await this.prisma.sliderImage.aggregate({ _max: { sortOrder: true } });
    const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

    const created = await this.prisma.sliderImage.create({
      data: {
        imageUrl: `/uploads/slider/${filename}`,
        originalName: file.originalname,
        sortOrder: nextSort,
      },
    });
    return this.toPublic(created);
  }

  async remove(id: string) {
    const row = await this.prisma.sliderImage.findUnique({ where: { id: BigInt(id) } });
    if (!row) {
      throw new NotFoundException('Image not found.');
    }

    await this.prisma.sliderImage.delete({ where: { id: row.id } });

    const filePath = join(process.cwd(), row.imageUrl.replace(/^\//, ''));
    await unlink(filePath).catch(() => {});

    return { success: true };
  }
}
