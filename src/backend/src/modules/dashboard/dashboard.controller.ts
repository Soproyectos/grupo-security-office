import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardInsightsService } from './dashboard-insights.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ALL_ROLES } from '../../common/rbac/roles.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('api/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly insights: DashboardInsightsService,
  ) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get('me')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary:
      'Espacio de trabajo del usuario autenticado: KPIs, Listas accesibles y actividad reciente',
  })
  @ApiQuery({ name: 'take', required: false, type: Number })
  getMyWorkspace(@CurrentUser() user: any, @Query('take') take?: string) {
    const parsed = take !== undefined ? Number(take) : undefined;
    const safeTake =
      parsed !== undefined && Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.trunc(parsed), 50)
        : undefined;
    return this.dashboardService.getMyWorkspace(this.ctx(user), {
      take: safeTake,
    });
  }

  /**
   * Agregados que alimentan los bloques del catálogo y que `getMyWorkspace` no
   * cubre. Cada sección exige su permiso: ocultar un bloque en el frontend no
   * protege el dato, de modo que el endpoint que lo sirve valida por su cuenta.
   */
  @Get('insights/catalog')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Agregados de catálogo (productos, categorías, publicación)' })
  getCatalogInsights() {
    return this.insights.getCatalogInsights();
  }

  @Get('insights/users')
  @Permissions('users:read')
  @ApiOperation({ summary: 'Agregados de usuarios y distribución por rol' })
  getUsersInsights() {
    return this.insights.getUsersInsights();
  }

  /**
   * Mejores clientes. El alcance lo decide el servidor, no el cliente: quien no
   * supervisa a nadie ve su propia cartera, y quien supervisa ve la de la
   * empresa. Aceptar el alcance como parámetro permitiría a un vendedor pedir
   * el consolidado ajeno.
   */
  @Get('insights/top-customers')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Mejores clientes por facturación del mes' })
  async getTopCustomers(@CurrentUser() user: any) {
    const ownerId = await this.resolveCommercialScope(user);
    return this.insights.getTopCustomers({ ownerId });
  }

  @Get('insights/sales-by-category')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Ventas del mes por categoría de producto' })
  async getSalesByCategory(@CurrentUser() user: any) {
    const ownerId = await this.resolveCommercialScope(user);
    return this.insights.getSalesByCategory({ ownerId });
  }

  /**
   * `undefined` = alcance global (toda la empresa); un id = sólo ese usuario.
   * Los roles con visión transversal ven el consolidado; el resto, lo suyo.
   */
  private async resolveCommercialScope(user: any): Promise<string | undefined> {
    const roles: string[] = user?.roles ?? [];
    const GLOBAL_ROLES = ['Super Admin', 'Supervisor', 'Admin Comercial'];

    return roles.some((r) => GLOBAL_ROLES.includes(r))
      ? undefined
      : (user?.sub ?? user?.id);
  }

  /**
   * Drill-down del bloque team (issue #27): devuelve el bloque `commercial`
   * EXACTO que el usuario consultado vería en su propio getMyWorkspace.
   * Acceso restringido por la jerarquía (assertCanViewUser: el propio
   * usuario, un ancestro directo/indirecto, o Super Admin; resto → 403).
   */
  @Get('team/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary:
      'Bloque comercial individual de un miembro del equipo (solo ancestros/self)',
  })
  getTeamMember(
    @CurrentUser() user: any,
    @Param('userId') targetUserId: string,
  ) {
    return this.dashboardService.getTeamMemberCommercial(
      this.ctx(user),
      targetUserId,
    );
  }
}
