import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
