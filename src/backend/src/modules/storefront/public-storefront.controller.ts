import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { StorefrontService } from './storefront.service';

/**
 * Contacto del storefront (sin JWT). No es datos sensibles —la tienda los
 * muestra— pero sí es un endpoint anónimo, así que lleva el mismo throttle que
 * el resto del catálogo público.
 *
 * NUNCA falla por falta de datos: si la tabla está vacía el service devuelve
 * los valores demo en vez de un 500, para que la tienda no quede en blanco.
 */
@ApiTags('Public Storefront')
@Controller('api/public/storefront')
export class PublicStorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('contact')
  @ApiOperation({ summary: 'Datos de contacto públicos de la tienda (storefront)' })
  getContact() {
    return this.storefrontService.getPublicContact();
  }
}