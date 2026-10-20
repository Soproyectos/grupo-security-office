import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';
import { AuditService } from '../audit/audit.service';
import { AccessContext } from '../../common/acl/acl.service';
import { UserPermissionsService } from '../../common/security/user-permissions.service';
import { GrantPermissionsDto } from './dto/grant-permissions.dto';
import { AccountLockoutService } from '../../common/security/account-lockout.service';
import { AssignAccessDto } from './dto/assign-access.dto';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { LiveAdminIdentityService } from '../../common/security/live-admin-identity.service';
import type { PassportSessionUser } from '../../common/security/live-admin-identity.service';
import { ACCESS_CATALOG, ACCESS_CATALOG_VERSION, PACKAGE_TEMPLATES } from '../../common/security/access-catalog';

/**
 * COM-01 backend (E1 — DESVIACIÓN AUTORIZADA): cuerpo del PUT de concesiones.
 *
 * Amplía el DTO `AssignAccessDto` de BASE-04 con la versión OCC del destinatario
 * (obligatoria para `replaceSource`) y el modo paquete. En modo paquete se
 * envía `grants: []` (el array sigue obligatorio por el DTO padre); `packageId`
 * y grants no-empty son excluyentes. `expectedCatalogVersion` lo valida el DTO
 * a 400; el servicio responde además 409 `catalog-version-conflict` cuando se
 * lo invoca directamente con un catálogo desactualizado.
 */
export class PutUserAccessDto extends AssignAccessDto {
  @ApiProperty({ description: 'Versión OCC vigente del estado de concesiones del destinatario' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({
    description: 'Id de paquete del catálogo (modo paquete); excluyente con grants',
    example: 'vendedor',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message: 'packageId debe ser un id kebab-case del catálogo de paquetes (p. ej. vendedor).',
  })
  packageId?: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly hierarchyService: HierarchyService,
    private readonly auditService: AuditService,
    private readonly userPermissions: UserPermissionsService,
    private readonly lockout: AccountLockoutService,
    private readonly accessAssignments: AccessAssignmentsService,
    private readonly liveIdentity: LiveAdminIdentityService,
  ) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Listar usuarios' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 50,
      search,
    });
  }

  @Get(':id')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Crear usuario' })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(createUserDto, user?.sub ?? user?.id);
  }

  @Put(':id')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Actualizar usuario' })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, updateUserDto, user?.sub ?? user?.id);
  }

  @Delete(':id')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Eliminar usuario' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.remove(id, user?.sub ?? user?.id);
  }

  @Patch(':id/supervisor')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Asignar supervisor a un usuario' })
  async setSupervisor(
    @Param('id') id: string,
    @Body() body: { supervisorId: string | null },
    @CurrentUser() user: any,
  ) {
    const ctx = this.ctx(user);
    await this.hierarchyService.assertCanSetSupervisor(id, body.supervisorId);
    
    const updated = await this.usersService.update(id, { supervisorId: body.supervisorId }, ctx.userId);
    
    await this.auditService.log({
      userId: ctx.userId,
      entity: 'User',
      entityId: id,
      action: 'update',
      newValues: { supervisorId: body.supervisorId },
    });
    
    return updated;
  }

  @Get('me/team')
  @ApiOperation({ summary: 'Obtener el equipo del usuario actual' })
  async getMyTeam(@CurrentUser() user: any) {
    const userId = user?.sub ?? user?.id;
    return this.hierarchyService.getTeamTree(userId);
  }
  /**
   * Concesiones de dashboard de un usuario (fase 5).
   *
   * Sólo Super Admin: reparte visibilidad sobre datos de toda la organización.
   */
  @Get(':id/dashboard-permissions')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Bloques y paquetes de dashboard concedidos a un usuario' })
  async getDashboardPermissions(@Param('id') id: string) {
    return {
      granted: await this.userPermissions.listForUser(id),
      availablePacks: this.userPermissions.availablePacks(),
    };
  }

  /**
   * Reemplaza el conjunto de concesiones por el indicado.
   *
   * Se envía el estado completo de las casillas, no un diferencial: calcular
   * altas y bajas en el cliente permitiría que una pantalla desactualizada
   * reviviera concesiones ya retiradas.
   */
  @Put(':id/dashboard-permissions')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Reemplaza las concesiones de dashboard de un usuario' })
  async setDashboardPermissions(
    @Param('id') id: string,
    @Body() dto: GrantPermissionsDto,
    @CurrentUser() user: any,
  ) {
    const granted = await this.userPermissions.replaceForUser(
      id,
      dto.permissions,
      user?.sub ?? user?.id,
      dto.reason,
    );

    return {
      granted,
      // El JWT lleva los permisos embebidos, así que lo concedido no aplica
      // hasta que el usuario vuelva a autenticarse. Decirlo evita el reporte de
      // "se lo di y no lo ve".
      note: 'Las concesiones se aplican la próxima vez que el usuario inicie sesión.',
    };
  }

  /**
   * COM-01 backend (E1) — concesiones por acción+alcance de un usuario.
   *
   * Devuelve las concesiones vigentes, su procedencia (fuente manual o
   * paquete) y el estado de los paquetes del catálogo, con la versión OCC y
   * el catálogo con el que se sirven (el navegador la ecoa al asignar).
   */
  @Get(':id/access')
  @ApiOperation({ summary: 'Concesiones por acción, procedencia y paquetes de un usuario (COM-01)' })
  async getUserAccess(@Param('id') id: string, @CurrentUser() user: PassportSessionUser) {
    const actor = this.ctx(user);
    if (!actor.userId) throw new UnauthorizedException('Se requiere una sesión vigente');
    if (actor.userId !== id && !actor.roles.includes('Super Admin')) {
      throw new NotFoundException('Usuario no encontrado');
    }
    await this.usersService.findOne(id); // 404 si el destinatario no existe
    const [grants, sources, accessVersion] = await Promise.all([
      this.accessAssignments.grantsForUser(id),
      this.accessAssignments.sourcesFor(id),
      this.accessAssignments.accessVersionFor(id),
    ]);
    return {
      userId: id,
      ...(actor.roles.includes('Super Admin') ? { actions: ACCESS_CATALOG } : {}),
      catalogVersion: ACCESS_CATALOG_VERSION,
      accessVersion,
      grants,
      sources,
      packages: PACKAGE_TEMPLATES.map((pkg) => {
        const applied = sources.find(
          (source) => source.kind === 'template' && source.templateId === pkg.id,
        );
        return {
          id: pkg.id,
          name: pkg.name,
          selections: pkg.selections,
          applied: Boolean(applied),
          sourceId: applied?.id ?? null,
        };
      }),
    };
  }

  /**
   * Asigna concesiones por acción (modo grants, fuente manual) o aplica un
   * paquete del catálogo (modo packageId, fuente template). La identidad del
   * administrador se reconstruye en servidor por petición (LiveAdminIdentity):
   * el cuerpo nunca aporta userId, roles ni scope. La revocación refleja en la
   * siguiente petición (lectura viva del GET); revalidar AccessGrant dentro
   * del JWT queda pendiente E6 (COM-01 §8).
   */
  @Put(':id/access')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Asigna concesiones por acción o aplica un paquete (COM-01)' })
  async setUserAccess(
    @Param('id') id: string,
    @Body() dto: PutUserAccessDto,
    @Req() req: { user?: PassportSessionUser },
  ) {
    const actor = await this.liveIdentity.fromRequest(req);

    if (dto.packageId) {
      if (dto.grants.length > 0) {
        throw new BadRequestException('Envíe packageId o grants, no ambos.');
      }
      return this.accessAssignments.applyPackage(actor, id, dto.packageId, {
        expectedVersion: dto.expectedVersion,
        catalogVersion: dto.expectedCatalogVersion,
        ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
        ...(dto.reason ? { reason: dto.reason } : {}),
      });
    }

    if (dto.grants.length === 0) {
      throw new BadRequestException('Envíe al menos un grant o un packageId.');
    }
    return this.accessAssignments.replaceManualSource(actor, id, {
      expectedVersion: dto.expectedVersion,
      catalogVersion: dto.expectedCatalogVersion,
      ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
      ...(dto.reason ? { reason: dto.reason } : {}),
      grants: dto.grants,
    });
  }

  /**
   * Retira la fuente template del paquete indicado; las demás fuentes del
   * usuario se conservan (COM-01 §3: si otra concede la misma acción, el
   * acceso permanece con su alcance).
   */
  @Delete(':id/access/packages/:packageId')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Retira un paquete aplicado conservando las demás fuentes (COM-01)' })
  async deleteUserPackage(
    @Param('id') id: string,
    @Param('packageId') packageId: string,
    @Query('expectedVersion') expectedVersion: string,
    @Req() req: { user?: PassportSessionUser },
  ) {
    const actor = await this.liveIdentity.fromRequest(req);
    return this.accessAssignments.removePackage(actor, id, packageId, {
      expectedVersion: Number(expectedVersion),
    });
  }

  /** Retira una fuente manual completa; permite dejar al usuario sin paneles. */
  @Delete(':id/access/manual/:sourceId')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Retira una asignación manual conservando otros paquetes' })
  async deleteManualAccess(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @Query('expectedVersion') expectedVersion: string,
    @Req() req: { user?: PassportSessionUser },
  ) {
    const actor = await this.liveIdentity.fromRequest(req);
    if (!actor.superAdmin) throw new ForbiddenException('Sólo Super Admin puede retirar concesiones');
    const source = (await this.accessAssignments.sourcesFor(id)).find(
      (item) => item.id === sourceId && item.kind === 'manual',
    );
    if (!source) throw new NotFoundException('Asignación manual no encontrada');
    return this.accessAssignments.removeSource(actor, id, sourceId, {
      expectedVersion: Number(expectedVersion),
    });
  }

  /**
   * Levanta el bloqueo por intentos fallidos de una cuenta (S.3 del hardening).
   */
  @Post(':id/unlock')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Desbloquea una cuenta bloqueada por intentos fallidos' })
  async unlockAccount(@Param('id') id: string, @CurrentUser() user: any) {
    const target = await this.usersService.findOne(id);
    const cleared = await this.lockout.unlock(target.email);

    await this.auditService.log({
      userId: user?.sub ?? user?.id,
      action: 'unlock-account',
      entity: 'User',
      entityId: id,
      newValues: { clearedAttempts: cleared },
      result: 'SUCCESS',
    });

    return { unlocked: true, clearedAttempts: cleared };
  }
}
