import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AccessContext } from '../../../common/acl/acl.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PublicationBoardService } from './publication-board.service';

/**
 * CAT-06 (P4) — bandeja de publicación: pendientes / con problemas / publicados /
 * historial, por alcance de Lista (diseño §6/§7). Solo LECTURA: publicar,
 * retirar y programar siguen por sus endpoints canónicos (mismo servicio).
 */
@ApiTags('Catalog')
@ApiBearerAuth()
@Controller('api/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta')
export class PublicationBoardController {
  constructor(private readonly publication: PublicationBoardService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get('publication-board')
  @ApiOperation({ summary: 'Bandeja de publicación por vista (pendientes|problemas|publicados|historial)' })
  @ApiQuery({ name: 'view', required: false, description: 'Vista (por defecto: pendientes)' })
  @ApiQuery({ name: 'search', required: false, description: 'Búsqueda por SKU/nombre (opcional)' })
  @ApiQuery({ name: 'page', required: false, description: 'Página de 50 (por defecto 0)' })
  @ApiResponse({ status: 200, description: '{ view, page, pageSize, total, items }' })
  @ApiResponse({ status: 400, description: 'Vista no reconocida' })
  board(@Query('view') view?: string, @Query('search') search?: string, @Query('page') page?: string, @CurrentUser() user?: any) {
    return this.publication.board(view ?? 'pendientes', this.ctx(user), { search, page: page ? Number(page) : 0 });
  }
}
