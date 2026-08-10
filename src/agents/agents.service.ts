import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentLoginDto } from './dto/agent-login.dto';
import { AgentChangePasswordDto } from './dto/agent-change-password.dto';

const SALT_ROUNDS = 10;

type AgentRow = {
  id: bigint;
  fullName: string;
  phoneNumber: string;
  commission: unknown;
  accountLimit: unknown;
  isActive: boolean;
  createdAt: Date;
  paymentAccounts: {
    id: bigint;
    method: string;
    label: string;
    accountNumber: string;
    accountName: string | null;
    details: string | null;
    isActive: boolean;
    createdAt: Date;
  }[];
};

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Same shape for the admin list/detail view and what an agent sees about
  // themselves after logging in — never includes the password hash.
  private toAdmin(agent: AgentRow) {
    return {
      id: agent.id.toString(),
      fullName: agent.fullName,
      phoneNumber: agent.phoneNumber,
      commission: Number(agent.commission),
      accountLimit: Number(agent.accountLimit),
      isActive: agent.isActive,
      createdAt: agent.createdAt.toISOString(),
      paymentAccounts: agent.paymentAccounts.map((p) => ({
        id: p.id.toString(),
        method: p.method,
        label: p.label,
        accountNumber: p.accountNumber,
        accountName: p.accountName,
        details: p.details,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async findAll() {
    const agents = await this.prisma.agent.findMany({
      include: { paymentAccounts: true },
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((a) => this.toAdmin(a));
  }

  async findOne(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
      include: { paymentAccounts: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    return this.toAdmin(agent);
  }

  async create(dto: CreateAgentDto) {
    const existing = await this.prisma.agent.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existing) {
      throw new ConflictException(
        'An agent with this phone number already exists.',
      );
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, SALT_ROUNDS)
      : null;

    const agent = await this.prisma.agent.create({
      data: {
        fullName: dto.fullName.trim(),
        phoneNumber: dto.phoneNumber.trim(),
        passwordHash,
        commission: dto.commission ?? 0,
        accountLimit: dto.accountLimit ?? 0,
        paymentAccounts: dto.paymentAccounts?.length
          ? {
              create: dto.paymentAccounts.map((p) => ({
                method: p.method,
                label: p.label.trim(),
                accountNumber: p.accountNumber.trim(),
                accountName: p.accountName?.trim() || null,
                details: p.details?.trim() || null,
              })),
            }
          : undefined,
      },
      include: { paymentAccounts: true },
    });
    return this.toAdmin(agent);
  }

  async update(id: string, dto: UpdateAgentDto) {
    const existing = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Agent not found.');
    }

    if (dto.phoneNumber && dto.phoneNumber.trim() !== existing.phoneNumber) {
      const clash = await this.prisma.agent.findUnique({
        where: { phoneNumber: dto.phoneNumber.trim() },
      });
      if (clash) {
        throw new ConflictException(
          'An agent with this phone number already exists.',
        );
      }
    }

    const agent = await this.prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
        ...(dto.phoneNumber !== undefined && {
          phoneNumber: dto.phoneNumber.trim(),
        }),
        ...(dto.password && {
          passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
        }),
        ...(dto.commission !== undefined && { commission: dto.commission }),
        ...(dto.accountLimit !== undefined && {
          accountLimit: dto.accountLimit,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { paymentAccounts: true },
    });
    return this.toAdmin(agent);
  }

  async remove(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    await this.prisma.agent.delete({ where: { id: agent.id } });
    return { success: true };
  }

  async login(dto: AgentLoginDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { phoneNumber: dto.phoneNumber },
      include: { paymentAccounts: true },
    });
    if (!agent || !agent.passwordHash) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }
    const matches = await bcrypt.compare(dto.password, agent.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid phone number or password.');
    }
    if (!agent.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact an admin.',
      );
    }
    return this.toAdmin(agent);
  }

  async changePassword(id: string, dto: AgentChangePasswordDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: BigInt(id) },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    if (!agent.passwordHash) {
      throw new UnauthorizedException(
        'No password has been set for this account yet. Contact an admin.',
      );
    }
    const matches = await bcrypt.compare(dto.oldPassword, agent.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { passwordHash },
    });
    return { success: true };
  }
}
