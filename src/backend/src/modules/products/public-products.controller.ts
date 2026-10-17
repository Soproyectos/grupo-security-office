import { Request, Response } from 'express';
import { StorefrontService } from '../storefront/storefront.service';
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCatalogService } from './public-catalog.service';
import { PublicProductSearchDto } from './dto/public-product-search.dto';
import { PublicProductParamsDto } from './dto/public-product-params.dto';

/**
 * Catálogo público del storefront (sin JWT). Solo expone productos PUBLISHED y
 * el único precio público (lista `PUBLIC_PRICE_LIST_CODE`, por defecto
 * `CLIENTE_FINAL_IVA`); nunca otras listas, costos ni `extraAttributes`.
 */
@ApiTags('Public Products')
@Controller('api/public/products')
export class PublicProductsController {
  constructor(private readonly catalog: PublicCatalogService, private readonly customers: StorefrontService) {}

  /**
   * Búsqueda y listado por categoría, paginados. Responde `{ data, meta }` con
   * `meta = { total, offset, limit }`.
   *
   * Decisión: un `category` (slug) desconocido o inactivo NO es un error; se
   * responde 200 con `data: []` y `meta.total: 0`, porque la página de
   * categoría del storefront resuelve el slug contra el menú y una categoría
   * vacía debe verse como "sin productos", no como un fallo de red.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'Listar/buscar productos publicados con su precio público (storefront)' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Término de búsqueda (nombre o SKU)' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Slug de categoría (incluye subcategorías); desconocido = lista vacía' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Productos a omitir (default 0)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Cantidad máxima de resultados (default 24, tope 48)' })
  async search(@Query() query: PublicProductSearchDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store'); res.vary('Cookie');
    const result = await this.catalog.search(query);
    return { ...result, data: await this.customers.applyCustomerPrices(result.data, req.cookies?.gs_customer_session) };
  }

  /**
   * Ficha pública de un producto. Id con formato inválido → 400 (validación de
   * DTO); id inexistente o producto que no está PUBLISHED → 404.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':id')
  @ApiOperation({ summary: 'Detalle público de un producto publicado (storefront)' })
  @ApiResponse({ status: 404, description: 'El producto no existe o no está publicado' })
  async detail(@Param() params: PublicProductParamsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store'); res.vary('Cookie');
    const result = await this.catalog.getDetail(params.id);
    return (await this.customers.applyCustomerPrices([result], req.cookies?.gs_customer_session))[0];
  }
}
