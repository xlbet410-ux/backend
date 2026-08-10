import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPages() {
    return this.prisma.page.findMany({ orderBy: { path: 'asc' } });
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: { pages: true, _count: { select: { accounts: true } } },
      orderBy: { id: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id.toString(),
      name: r.name,
      canApprove: r.canApprove,
      isBuiltIn: r.isBuiltIn,
      pages: r.pages.map((p) => p.pagePath),
      accountCount: r._count.accounts,
    }));
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A role with this name already exists.');
    }
    if (dto.pages.length === 0) {
      throw new BadRequestException('Select at least one page for this role.');
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        canApprove: dto.canApprove ?? false,
        pages: { create: dto.pages.map((pagePath) => ({ pagePath })) },
      },
    });
    return { id: role.id.toString() };
  }

  async update(id: string, dto: UpdateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Role not found.');
    }

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.role.findUnique({
        where: { name: dto.name },
      });
      if (clash) {
        throw new ConflictException('A role with this name already exists.');
      }
    }

    if (dto.pages && dto.pages.length === 0) {
      throw new BadRequestException('Select at least one page for this role.');
    }

    await this.prisma.$transaction(async (db) => {
      await db.role.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.canApprove !== undefined && { canApprove: dto.canApprove }),
        },
      });
      if (dto.pages) {
        await db.rolePage.deleteMany({ where: { roleId: existing.id } });
        await db.rolePage.createMany({
          data: dto.pages.map((pagePath) => ({
            roleId: existing.id,
            pagePath,
          })),
        });
      }
    });
    return { success: true };
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: BigInt(id) },
      include: { _count: { select: { accounts: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    if (role.isBuiltIn) {
      throw new BadRequestException("Built-in roles can't be deleted.");
    }
    if (role._count.accounts > 0) {
      throw new BadRequestException(
        "Can't delete a role that's assigned to existing accounts.",
      );
    }

    await this.prisma.role.delete({ where: { id: role.id } });
    return { success: true };
  }
}
