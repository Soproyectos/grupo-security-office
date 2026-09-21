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
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto';
import { UpdateSalesOrderInvoiceDto } from './dto/update-sales-order-invoice.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AccessContext } from '../../../common/acl/acl.service';

const READ_ROLES = [
  'Super Admin',
  'Supervisor',
  'Admin Comercial',
  'Vendedor',
  'Consulta',
];
// Registro de factura externa: mismos roles que marcan una quote como ganada.
const INVOICE_ROLES = ['Super Admin', 'Admin Comercial', 'Supervisor'];

@ApiTags('Commercial - Sales Orders')
@ApiBearerAuth()
@Controller('api/commercial/sales-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Listar pedidos de venta (scope por jerarquía de owner)' })
  findAll(@CurrentUser() user: any, @Query() query: SalesOrderQueryDto) {
    return this.salesOrdersService.findAll(query, this.ctx(user));
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Detalle de un pedido de venta con su quote y cliente' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.salesOrdersService.findOne(id, this.ctx(user));
  }

  @Patch(':id/invoice')
  @Roles(...INVOICE_ROLES)
  @ApiOperation({
    summary:
      'Registrar número/fecha de factura externa de Yéminus (registro manual)',
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
