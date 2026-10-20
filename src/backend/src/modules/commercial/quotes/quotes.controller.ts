import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { AddQuoteItemDto } from './dto/add-quote-item.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { UpdateQuoteItemDiscountDto } from './dto/update-quote-item-discount.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { QuotesAccessContext } from './quotes.service';

@ApiTags('Commercial - Quotes')
@ApiBearerAuth()
@Controller('api/commercial/quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  private ctx(user: any): QuotesAccessContext {
    // `jti` alimenta la identidad de `resolveAccess` (quotes:discount),
    // patrón customers.controller.ts:36-39.
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], jti: user?.jti };
  }

  @Get()
  @ApiOperation({ summary: 'Listar cotizaciones (scoping por jerarquía de owner)' })
  findAll(@CurrentUser() user: any, @Query() query: QuoteQueryDto) {
    return this.quotesService.findAll(query, this.ctx(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una cotización con sus ítems (snapshot)' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.findOne(id, this.ctx(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cotización en borrador (requiere customerId + listaId)' })
  create(@CurrentUser() user: any, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(dto, this.ctx(user));
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Agregar ítem (snapshot del precio vigente en la tarifa; sin descuento)',
  })
  @ApiResponse({ status: 400, description: 'discountPct no permitido en el alta' })
  @ApiResponse({ status: 403, description: 'Producto o Lista sin nivel view_prices' })
  @ApiResponse({ status: 409, description: 'Sin precio vigente para el producto (409 con SKU)' })
  addItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddQuoteItemDto,
  ) {
    return this.quotesService.addItem(id, dto, this.ctx(user));
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Cambiar cantidad de un ítem (conserva el descuento; recalcula totales)' })
  @ApiResponse({
    status: 400,
    description: 'discountPct en el payload → discount-not-allowed-in-general-edit (sin escritura parcial)',
  })
  updateItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuoteItemDto,
  ) {
    return this.quotesService.updateItem(id, itemId, dto, this.ctx(user));
  }

  @Patch(':id/items/:itemId/discount')
  @ApiOperation({
    summary: 'Aplicar descuento de línea (operación sensible: quotes:discount; conserva la cantidad)',
  })
  @ApiResponse({ status: 403, description: 'Sin quotes:discount sobre la cotización o fuera de alcance' })
  @ApiResponse({ status: 404, description: 'Cotización fuera de scope o ítem ajeno' })
  @ApiResponse({ status: 409, description: 'Ítems no editables en el estado actual' })
  updateItemDiscount(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuoteItemDiscountDto,
  ) {
    return this.quotesService.updateItemDiscount(id, itemId, dto, this.ctx(user));
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Quitar un ítem (recalcula totales)' })
  removeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quotesService.removeItem(id, itemId, this.ctx(user));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transición de estado (ganada convierte lead→cliente; sin aprobación ni factura ERP)' })
  @ApiResponse({ status: 400, description: 'perdida sin lostReason' })
  @ApiResponse({ status: 403, description: 'Rol no habilitado para la transición (F3 pendiente)' })
  @ApiResponse({ status: 409, description: 'Transición inválida para el estado actual' })
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.quotesService.updateStatus(id, dto, this.ctx(user));
  }
}
