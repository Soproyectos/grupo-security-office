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
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
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
const WRITE_ROLES = ['Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor'];

@ApiTags('Commercial - Quotes')
@ApiBearerAuth()
@Controller('api/commercial/quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Listar cotizaciones (scoping por jerarquía de owner)' })
  findAll(@CurrentUser() user: any, @Query() query: QuoteQueryDto) {
    return this.quotesService.findAll(query, this.ctx(user));
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Detalle de una cotización con sus ítems (snapshot)' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.findOne(id, this.ctx(user));
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cotización en borrador (requiere customerId + listaId)' })
  create(@CurrentUser() user: any, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(dto, this.ctx(user));
  }

  @Post(':id/items')
  @Roles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar ítem (snapshot del precio vigente en la tarifa)' })
  @ApiResponse({ status: 409, description: 'Sin precio vigente para el producto (409 con SKU)' })
  addItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddQuoteItemDto,
  ) {
    return this.quotesService.addItem(id, dto, this.ctx(user));
  }

  @Patch(':id/items/:itemId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Cambiar cantidad/descuento de un ítem (recalcula totales)' })
  updateItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuoteItemDto,
  ) {
    return this.quotesService.updateItem(id, itemId, dto, this.ctx(user));
  }

  @Delete(':id/items/:itemId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Quitar un ítem (recalcula totales)' })
  removeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quotesService.removeItem(id, itemId, this.ctx(user));
  }

  @Patch(':id/status')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Transición de estado (ganada convierte lead→cliente)' })
  @ApiResponse({ status: 400, description: 'Transición inválida' })
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.quotesService.updateStatus(id, dto, this.ctx(user));
  }
}
