import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PricesService } from './prices.service';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Price Lists')
@ApiBearerAuth()
@Controller('api/prices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get('lists')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Listar listas de precios (metadato de tarifa)' })
  findAllPriceLists() {
    return this.pricesService.findAllPriceLists();
  }

  @Get('lists/:id')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Obtener lista de precios por ID' })
  findOnePriceList(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.findOnePriceList(id, this.ctx(user));
  }

  @Post('lists')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Crear lista de precios (tarifa)' })
  @ApiResponse({ status: 201, description: 'Lista creada' })
  createPriceList(@Body() dto: CreatePriceListDto, @CurrentUser() user: any) {
    return this.pricesService.createPriceList(dto, user?.sub ?? user?.id);
  }

  @Put('lists/:id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Actualizar lista de precios (tarifa)' })
  updatePriceList(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePriceListDto>,
    @CurrentUser() user: any,
  ) {
    return this.pricesService.updatePriceList(id, dto, user?.sub ?? user?.id);
  }

  @Patch('lists/:id/toggle-active')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Alternar estado activo de la lista de precios' })
  @ApiResponse({ status: 200, description: 'Lista actualizada' })
  togglePriceListActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.togglePriceListActive(id, user?.sub ?? user?.id);
  }

  @Delete('lists/:id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Eliminar lista de precios (tarifa)' })
  removePriceList(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.removePriceList(id, user?.sub ?? user?.id);
  }

  @Get('product/:productId')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Obtener precios de un producto' })
  findPricesByProduct(@Param('productId') productId: string, @CurrentUser() user: any) {
    return this.pricesService.findPricesByProduct(productId, this.ctx(user));
  }

  @Get('list/:priceListId')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Obtener precios de una lista' })
  findPricesByPriceList(@Param('priceListId') priceListId: string, @CurrentUser() user: any) {
    return this.pricesService.findPricesByPriceList(priceListId, this.ctx(user));
  }

  @Post()
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Crear precio' })
  @ApiResponse({ status: 201, description: 'Precio creado' })
  createPrice(@Body() dto: CreatePriceDto, @CurrentUser() user: any) {
    return this.pricesService.createPrice(dto, this.ctx(user));
  }

  @Put(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Actualizar precio' })
  updatePrice(@Param('id') id: string, @Body() dto: UpdatePriceDto, @CurrentUser() user: any) {
    return this.pricesService.updatePrice(id, dto, this.ctx(user));
  }

  @Delete(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Eliminar precio' })
  removePrice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.removePrice(id, this.ctx(user));
  }
}
