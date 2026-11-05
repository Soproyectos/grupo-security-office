import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireGrant } from '../../common/security/require-grant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProductChangeService } from './product-change.service';

/**
 * Per-product change history. Authorization is decided in the service
 * (`products:read`, `products:write`, and `products:notes`; `price:*` fields need `prices:read`).
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/products/:id/changes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductChangesController {
  constructor(private readonly changes: ProductChangeService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @RequireGrant('products:read', 'products:write', 'products:notes')
  @ApiOperation({ summary: 'Historial de cambios del producto (más recientes primero)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo 100' })
  @ApiQuery({ name: 'field', required: false, type: String })
  @ApiQuery({ name: 'source', required: false, type: String })
  @ApiResponse({ status: 403, description: 'Sin concesiones globales products:read, products:write y products:notes' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  list(
    @Param('id') id: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('field') field: string | undefined,
    @Query('source') source: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.changes.list(id, this.ctx(user), { cursor, limit, field, source });
  }
}
