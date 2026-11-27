import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SalesOrdersService, SalesOrdersAccessContext } from './sales-orders.service';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto';
import { UpdateSalesOrderInvoiceDto } from './dto/update-sales-order-invoice.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

/**
 * Pedidos de venta: se protegen con las acciones asignables `salesOrders:read` y
 * `salesOrders:invoice` (alcance propio / equipo / global). La comprobación y el filtro
 * de alcance viven en el servicio; Super Admin conserva su excepción.
 */
@ApiTags('Commercial - Sales Orders')
@ApiBearerAuth()
@Controller('api/commercial/sales-orders')
@UseGuards(JwtAuthGuard)
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  private ctx(user: any): SalesOrdersAccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], jti: user?.jti };
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos de venta (acción salesOrders:read y su alcance)' })
  findAll(@CurrentUser() user: any, @Query() query: SalesOrderQueryDto) {
    return this.salesOrdersService.findAll(query, this.ctx(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un pedido de venta con su quote y cliente' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.salesOrdersService.findOne(id, this.ctx(user));
  }

  @Patch(':id/invoice')
  @ApiOperation({
    summary:
      'Registrar número/fecha de factura externa de Yéminus (acción salesOrders:invoice y su alcance)',
  })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  updateInvoice(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderInvoiceDto,
  ) {
    return this.salesOrdersService.updateInvoice(id, dto, this.ctx(user));
  }
}
