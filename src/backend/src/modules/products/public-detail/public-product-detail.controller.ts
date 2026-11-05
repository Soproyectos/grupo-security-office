import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StorefrontService } from '../../storefront/storefront.service';
import { Public } from '../../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import type { ProductDetailDto } from './dto/product-detail.dto';
import { PublicProductDetailService } from './public-product-detail.service';

@Controller('api/public/products')
export class PublicProductDetailController {
  constructor(private readonly service: PublicProductDetailService, private readonly customers: StorefrontService) {}

  /**
   * Ficha detallada de producto (estilo Hikvision).
   * Retorna especificaciones agrupadas, documentos, firmware y acuerdo de licencia.
   * Acepta el id del producto o su slug de catálogo publicado.
   * Identificador inválido → 400; inexistente o no visible → 404.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':idOrSlug/detail')
  async findByIdOrSlug(@Param('idOrSlug') idOrSlug: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<ProductDetailDto> {
    res.setHeader('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    const result = await this.service.findByIdOrSlug(idOrSlug);
    return (await this.customers.applyCustomerPrices([result], req.cookies?.gs_customer_session))[0];
  }
}
