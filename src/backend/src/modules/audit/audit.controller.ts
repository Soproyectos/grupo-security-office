import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService, normalizeEntity } from './audit.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { assertGlobalGrant, hasGlobalGrant } from '../../common/security/require-grant';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('api/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly grants: AccessAssignmentsService,
  ) {}

  @Get()
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Listar logs de auditoría' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'entity', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @CurrentUser() user?: any,
  ) {
    const ctx = { roles: user?.roles ?? [], userId: user?.sub ?? user?.id };
    const libraryWrite = await hasGlobalGrant(this.grants, 'products:write', ctx)
      && await hasGlobalGrant(this.grants, 'products:notes', ctx);
    return this.auditService.findAll(
      {
        skip: skip ? parseInt(skip) : 0,
        take: take ? parseInt(take) : 50,
        entity,
        entityId,
        userId,
        action,
      },
      { ...ctx, libraryWrite },
    );
  }

  /**
   * El historial de Biblioteca puede incluir notas y requiere la pestaña Fichas con notas.
   * Ningún cargo la reemplaza; Super Admin conserva su excepción. Las entidades operativas
   * conservan su protección de siempre (Super Admin o Admin Comercial).
   */
  @Get(':entity/:entityId')
  @ApiOperation({ summary: 'Obtener auditoría: Biblioteca requiere Fichas con notas; entidades operativas requieren Super Admin o Admin Comercial' })
  async findByEntity(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user?: any,
  ) {
    const roles: string[] = user?.roles ?? [];
    if (['Product', 'ProductImage', 'Category', 'Brand', 'Price', 'PriceList', 'LISTA'].includes(normalizeEntity(entity) ?? '')) {
      await assertGlobalGrant(this.grants, 'products:write', { userId: user?.sub ?? user?.id, roles, userName: user?.name ?? null });
      await assertGlobalGrant(this.grants, 'products:notes', { userId: user?.sub ?? user?.id, roles, userName: user?.name ?? null });
    } else if (!roles.some((role) => role === 'Super Admin' || role === 'Admin Comercial')) {
      throw new ForbiddenException('Sin permiso para consultar esta auditoría');
    }
    return this.auditService.findByEntity(entity, entityId, {
      roles,
    });
  }
}
