import { Controller, Get, Header, Param } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import type { ProductDetailDto } from './dto/product-detail.dto';
import { PublicProductDetailService } from './public-product-detail.service';

@Controller('api/public/products')
export class PublicProductDetailController {
  constructor(private readonly service: PublicProductDetailService) {}

  /**
   * Ficha detallada de producto (estilo Hikvision).
   * Retorna especificaciones agrupadas, documentos, firmware y acuerdo de licencia.
   * Acepta el id del producto o su slug de catálogo publicado.
   * Identificador inválido → 400; inexistente o no visible → 404.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':idOrSlug/detail')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  findByIdOrSlug(@Param('idOrSlug') idOrSlug: string): Promise<ProductDetailDto> {
    return this.service.findByIdOrSlug(idOrSlug);
  }
}