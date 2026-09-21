import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { BCRYPT_ROUNDS } from '../../common/security/password.constants';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async findAll(params?: { skip?: number; take?: number; search?: string }) {
    const { skip = 0, take = 50, search } = params || {};

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        include: {
          roles: {
            include: { role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        ...u,
        password: undefined,
        roles: u.roles.map((ur) => ur.role),
      })),
      meta: { total, skip, take },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    return {
      ...user,
      password: undefined,
      roles: user.roles.map((ur) => ur.role),
    };
  }

  async create(dto: CreateUserDto, actorId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        password: hashedPassword,
        isActive: dto.isActive ?? true,
        roles: dto.roleIds?.length
          ? {
              create: dto.roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'create',
      entity: 'User',
      entityId: user.id,
      newValues: {
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        roles: user.roles.map((ur) => ur.role.name),
      },
    });

    return {
      ...user,
      password: undefined,
      roles: user.roles.map((ur) => ur.role),
    };
  }

  async update(id: string, dto: UpdateUserDto, actorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existing) throw new ConflictException('El email ya está registrado');
    }

    const data: Prisma.UserUpdateInput = {
      ...(dto.name && { name: dto.name }),
      ...(dto.email && { email: dto.email.toLowerCase() }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    if (dto.roleIds) {
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = {
        create: dto.roleIds.map((roleId) => ({ roleId })),
      };
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        roles: { include: { role: true } },
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'update',
      entity: 'User',
      entityId: id,
      oldValues: {
        email: user.email,
        name: user.name,
        isActive: user.isActive,
      },
      newValues: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email.toLowerCase() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        roles: updated.roles.map((ur) => ur.role.name),
      },
    });

    return {
      ...updated,
      password: undefined,
      roles: updated.roles.map((ur) => ur.role),
    };
  }

  async remove(id: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.audit.log({
      userId: actorId,
      action: 'delete',
      entity: 'User',
      entityId: user.id,
      newValues: { email: user.email, name: user.name },
    });

    await this.prisma.assignment.deleteMany({ where: { userId: id } });
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });

    return { message: 'Usuario eliminado exitosamente' };
  }
}
