import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PricesService } from './prices.service';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PriceActionGuard } from './price-action.guard';

@ApiTags('Price Lists')
@ApiBearerAuth()
@Controller('api/prices')
// Solo concesiones del panel (globales), decididas por PriceActionGuard: ningún cargo concede nada.
@UseGuards(JwtAuthGuard, PriceActionGuard)
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, userName: user?.name, roles: user?.roles ?? [] };
  }

  @Get('lists')
  @ApiOperation({ summary: 'Listar listas de precios (metadato de tarifa)' })
  findAllPriceLists() {
    return this.pricesService.findAllPriceLists();
  }

  @Get('lists/:id/usage')
  @ApiOperation({ summary: 'Uso y dependencias de la tarifa (precios, cotizaciones, cuentas, niveles del portal) y si se puede eliminar' })
  priceListUsage(@Param('id') id: string) {
    return this.pricesService.priceListUsage(id);
  }

  @Get('lists/:id')
  @ApiOperation({ summary: 'Obtener lista de precios por ID' })
  findOnePriceList(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.findOnePriceList(id, this.ctx(user));
  }

  @Post('lists')
  @ApiOperation({ summary: 'Crear lista de precios (tarifa)' })
  @ApiResponse({ status: 201, description: 'Lista creada' })
  createPriceList(@Body() dto: CreatePriceListDto, @CurrentUser() user: any) {
    return this.pricesService.createPriceList(dto, user?.sub ?? user?.id);
  }

  @Put('lists/:id')
  @ApiOperation({ summary: 'Actualizar lista de precios (tarifa)' })
  updatePriceList(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePriceListDto> & { confirmImpact?: boolean },
    @CurrentUser() user: any,
  ) {
    return this.pricesService.updatePriceList(id, dto, user?.sub ?? user?.id);
  }

  @Patch('lists/:id/toggle-active')
  @ApiOperation({ summary: 'Alternar estado activo de la lista de precios' })
  @ApiResponse({ status: 200, description: 'Lista actualizada' })
  togglePriceListActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.togglePriceListActive(id, user?.sub ?? user?.id);
  }

  @Delete('lists/:id')
  @ApiOperation({ summary: 'Eliminar lista de precios (tarifa)' })
  removePriceList(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.removePriceList(id, user?.sub ?? user?.id);
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Obtener precios de un producto' })
  findPricesByProduct(@Param('productId') productId: string, @CurrentUser() user: any) {
    return this.pricesService.findPricesByProduct(productId, this.ctx(user));
  }

  @Get('list/:priceListId')
  @ApiOperation({ summary: 'Obtener precios de una lista' })
  findPricesByPriceList(@Param('priceListId') priceListId: string, @CurrentUser() user: any) {
    return this.pricesService.findPricesByPriceList(priceListId, this.ctx(user));
  }

  @Post()
  @ApiOperation({ summary: 'Crear precio' })
  @ApiResponse({ status: 201, description: 'Precio creado' })
  createPrice(@Body() dto: CreatePriceDto, @CurrentUser() user: any) {
    return this.pricesService.createPrice(dto, this.ctx(user));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar precio' })
  updatePrice(@Param('id') id: string, @Body() dto: UpdatePriceDto, @CurrentUser() user: any) {
    return this.pricesService.updatePrice(id, dto, this.ctx(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar precio' })
  removePrice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricesService.removePrice(id, this.ctx(user));
  }
}
