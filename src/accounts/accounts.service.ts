import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountLoginDto } from './dto/login.dto';
import { ChangeAccountPasswordDto } from './dto/change-password.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(account: {
    id: bigint;
    username: string;
    roleId: bigint;
    percentage: unknown;
    isActive: boolean;
    createdAt: Date;
    role: { name: string };
  }) {
    return {
      id: account.id.toString(),
      username: account.username,
      roleId: account.roleId.toString(),
      roleName: account.role.name,
      percentage:
        account.percentage === null ? null : Number(account.percentage),
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
    };
  }

  async findAll() {
    const accounts = await this.prisma.account.findMany({
      include: { role: true },
      orderBy: { id: 'asc' },
    });
    return accounts.map((a) => this.toPublic(a));
  }

  async create(dto: CreateAccountDto) {
    const existing = await this.prisma.account.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already exists.');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: BigInt(dto.roleId) },
    });
    if (!role) {
      throw new BadRequestException('Select a valid role.');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, SALT_ROUNDS)
      : null;
    const account = await this.prisma.account.create({
      data: {
        username: dto.username,
        passwordHash,
        roleId: role.id,
        percentage: dto.percentage ?? null,
      },
    });
    return { id: account.id.toString() };
  }

  async update(id: string, dto: UpdateAccountDto) {
    const existing = await this.prisma.account.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Account not found.');
    }

    if (dto.username && dto.username !== existing.username) {
      const clash = await this.prisma.account.findUnique({
        where: { username: dto.username },
      });
      if (clash) {
        throw new ConflictException('Username already exists.');
      }
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: BigInt(dto.roleId) },
      });
      if (!role) {
        throw new BadRequestException('Select a valid role.');
      }
    }

    await this.prisma.account.update({
      where: { id: existing.id },
      data: {
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.roleId !== undefined && { roleId: BigInt(dto.roleId) }),
        ...(dto.percentage !== undefined && { percentage: dto.percentage }),
        ...(dto.password && {
          passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
        }),
      },
    });
    return { success: true };
  }

  async setActive(id: string, isActive: boolean) {
    const account = await this.prisma.account.findUnique({
      where: { id: BigInt(id) },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    await this.prisma.account.update({
      where: { id: account.id },
      data: { isActive },
    });
    return { success: true };
  }

  async remove(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: BigInt(id) },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    await this.prisma.account.delete({ where: { id: account.id } });
    return { success: true };
  }

  async login(dto: AccountLoginDto) {
    const account = await this.prisma.account.findUnique({
      where: { username: dto.username },
      include: { role: { include: { pages: true } } },
    });
    if (!account || !account.passwordHash) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const matches = await bcrypt.compare(dto.password, account.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    if (!account.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact an admin.',
      );
    }

    return {
      username: account.username,
      roleName: account.role.name,
      canApprove: account.role.canApprove,
      percentage:
        account.percentage === null ? null : Number(account.percentage),
      pages: account.role.pages.map((p) => p.pagePath),
    };
  }

  async changePassword(dto: ChangeAccountPasswordDto) {
    const account = await this.prisma.account.findUnique({
      where: { username: dto.username },
    });
    if (!account || !account.passwordHash) {
      throw new UnauthorizedException();
    }

    const matches = await bcrypt.compare(dto.oldPassword, account.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.account.update({
      where: { id: account.id },
      data: { passwordHash },
    });
    return { success: true };
  }
}
