import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('api/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get('me')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta')
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
   * Drill-down del bloque team (issue #27): devuelve el bloque `commercial`
   * EXACTO que el usuario consultado vería en su propio getMyWorkspace.
   * Acceso restringido por la jerarquía (assertCanViewUser: el propio
   * usuario, un ancestro directo/indirecto, o Super Admin; resto → 403).
   */
  @Get('team/:userId')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta')
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
