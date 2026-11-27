import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService, normalizeEntity } from './audit.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { assertGlobalGrant, hasGlobalGrant } from '../../common/security/require-grant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('api/audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly grants: AccessAssignmentsService,
  ) {}

  /** Auditoría: Super Admin o quien tenga la acción `audit:read` (global) en «Asignar paneles». */
  @Get()
  @ApiOperation({ summary: 'Listar logs de auditoría (requiere la acción audit:read)' })
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
    await assertGlobalGrant(this.grants, 'audit:read', ctx);
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
   * requieren la acción `audit:read` (Super Admin la tiene siempre).
   */
  @Get(':entity/:entityId')
  @ApiOperation({ summary: 'Obtener auditoría: Biblioteca requiere Fichas con notas; entidades operativas requieren audit:read' })
  async findByEntity(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user?: any,
  ) {
    const roles: string[] = user?.roles ?? [];
    const ctx = { userId: user?.sub ?? user?.id, roles, userName: user?.name ?? null };
    if (['Product', 'ProductImage', 'Category', 'Brand', 'Price', 'PriceList', 'LISTA'].includes(normalizeEntity(entity) ?? '')) {
      await assertGlobalGrant(this.grants, 'products:write', ctx);
      await assertGlobalGrant(this.grants, 'products:notes', ctx);
    } else {
      await assertGlobalGrant(this.grants, 'audit:read', ctx);
    }
    return this.auditService.findByEntity(entity, entityId, {
      roles,
    });
  }
}
