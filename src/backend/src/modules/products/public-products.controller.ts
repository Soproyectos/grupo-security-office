import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ProductsService } from './products.service';
import { PublicProductSearchDto } from './dto/public-product-search.dto';

@ApiTags('Public Products')
@Controller('api/public/products')
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'Buscar productos publicados (storefront)' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Término de búsqueda (nombre o SKU)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Cantidad máxima de resultados (default 24, tope 50)' })
  search(@Query() query: PublicProductSearchDto) {
    return this.productsService.searchPublic(query);
  }
}
