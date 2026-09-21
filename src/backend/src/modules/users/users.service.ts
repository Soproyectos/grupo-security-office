import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { BCRYPT_ROUNDS } from '../../common/security/password.constants';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { PrivilegedAccountService, SUPER_ADMIN_ROLE } from '../../common/security/privileged-account.service';
import { SessionService } from '../../common/security/session.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private passwordPolicy: PasswordPolicyService,
    private privileged: PrivilegedAccountService,
    private sessions: SessionService,
  ) {}

  /** ¿Alguno de estos roles es privilegiado? Determina la exigencia de contraseña. */
  private async rolesArePrivileged(roleIds?: string[]): Promise<boolean> {
    if (!roleIds?.length) return false;

    const count = await this.prisma.role.count({
      where: { id: { in: roleIds }, name: SUPER_ADMIN_ROLE },
    });

    return count > 0;
  }

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

    // La politica se evalua ANTES de hashear: 'admin123' ya no pasa (S.1).
    this.passwordPolicy.assert(dto.password, {
      privileged: await this.rolesArePrivileged(dto.roleIds),
      userInputs: [dto.email, dto.name],
    });

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

    // --- Salvaguardas de cuentas privilegiadas (S.5) ---
    const changesPrivilege =
      dto.roleIds !== undefined || dto.isActive !== undefined;

    if (changesPrivilege && actorId) {
      this.privileged.assertNotSelfPrivilegeChange(actorId, id);
    }

    if (dto.isActive === false) {
      await this.privileged.assertBreakGlass(id, 'desactivar este usuario');
    }

    if (dto.roleIds && (await this.privileged.willRemoveSuperAdmin(id, dto.roleIds))) {
      await this.privileged.assertBreakGlass(id, 'retirar el rol Super Admin');
    }

    const data: Prisma.UserUpdateInput = {
      ...(dto.name && { name: dto.name }),
      ...(dto.email && { email: dto.email.toLowerCase() }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    if (dto.password) {
      const targetIsPrivileged =
        (await this.privileged.isSuperAdmin(id)) ||
        (await this.rolesArePrivileged(dto.roleIds));

      this.passwordPolicy.assert(dto.password, {
        privileged: targetIsPrivileged,
        userInputs: [dto.email ?? user.email, dto.name ?? user.name],
      });

      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      data.passwordChangedAt = new Date();
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

    // Un cambio de contrasena, de roles o una desactivacion invalidan las
    // sesiones abiertas: de lo contrario el acceso anterior sobrevive hasta que
    // expire el JWT, que es justo lo que se queria poder cortar.
    if (dto.password || dto.roleIds || dto.isActive === false) {
      await this.sessions.revokeAllForUser(
        id,
        dto.password ? 'PASSWORD_CHANGE' : 'ADMIN_REVOKE',
      );
    }

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

    if (actorId) {
      this.privileged.assertNotSelfPrivilegeChange(actorId, id);
    }

    await this.privileged.assertBreakGlass(id, 'eliminar este usuario');

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
