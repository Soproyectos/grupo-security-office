import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Sales Orders')
@ApiBearerAuth()
@Controller('api/sales-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta')
  @Permissions('sales-order:read')
  @ApiOperation({ summary: 'Listar todas las órdenes de venta' })
  @ApiResponse({ status: 200, description: 'Lista de órdenes de venta' })
  findAll() {
    return this.salesOrdersService.findAll();
  }

  @Get(':id')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta')
  @Permissions('sales-order:read')
  @ApiOperation({ summary: 'Obtener orden de venta por ID' })
  @ApiResponse({ status: 200, description: 'Orden de venta encontrada' })
  @ApiResponse({ status: 404, description: 'Orden de venta no encontrada' })
  findOne(@Param('id') id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Post()
  @Roles('Super Admin', 'Admin Comercial')
  @Permissions('sales-order:create')
  @ApiOperation({ summary: 'Crear nueva orden de venta' })
  @ApiResponse({ status: 201, description: 'Orden de venta creada' })
  create(@Body() dto: CreateSalesOrderDto) {
    return this.salesOrdersService.create(dto);
  }

  @Put(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @Permissions('sales-order:update')
  @ApiOperation({ summary: 'Actualizar orden de venta' })
  @ApiResponse({ status: 200, description: 'Orden de venta actualizada' })
  @ApiResponse({ status: 404, description: 'Orden de venta no encontrada' })
  update(@Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.salesOrdersService.update(id, dto);
  }

  @Patch(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @Permissions('sales-order:update')
  @ApiOperation({ summary: 'Actualizar parcialmente orden de venta' })
  @ApiResponse({ status: 200, description: 'Orden de venta actualizada' })
  @ApiResponse({ status: 404, description: 'Orden de venta no encontrada' })
  updatePartial(@Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.salesOrdersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @Permissions('sales-order:delete')
  @ApiOperation({ summary: 'Eliminar orden de venta' })
  @ApiResponse({ status: 200, description: 'Orden de venta eliminada' })
  @ApiResponse({ status: 404, description: 'Orden de venta no encontrada' })
  remove(@Param('id') id: string) {
    return this.salesOrdersService.remove(id);
  }
}