import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogSearch } from '../../common/security/throttle-policy';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCatalogService } from './public-catalog.service';
import { PublicProductSearchDto } from './dto/public-product-search.dto';

/** Store filters built from the PUBLISHED key specs of the products visible in the public catalog. */
@ApiTags('Public Products')
@Controller('api/public/catalog')
export class PublicCatalogKeySpecFacetsController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Public()
  @CatalogSearch()
  @Get('requirements')
  requirements(@Query() query: PublicProductSearchDto, @Res({ passthrough: true }) res: Response) {
    const { category, subcategory } = query;
    if (typeof category !== 'string' || !/^[a-z0-9-]{1,100}$/.test(category)) throw new BadRequestException('Selecciona una categoría válida');
    if (subcategory !== undefined && (typeof subcategory !== 'string' || subcategory.length > 300 || !/^[a-z0-9-]+(,[a-z0-9-]+){0,2}$/.test(subcategory))) throw new BadRequestException('Selecciona una subcategoría válida');
    res.setHeader('Cache-Control', 'private, no-store');
    return this.catalog.requirements(category, subcategory, query);
  }

  @Public()
  @CatalogSearch()
  @Get('key-spec-facets')
  @ApiOperation({ summary: 'Filter facets (key specs) of a subcategory; a product listing filter uses `keySpec=<specKey>:<value>`' })
  facets(@Query('subcategoryId') subcategoryId: string | undefined, @Res({ passthrough: true }) res: Response) {
    const id = subcategoryId?.trim();
    if (!id || id.length > 64) throw new BadRequestException('subcategoryId es obligatorio');
    res.setHeader('Cache-Control', 'private, no-store');
    return this.catalog.keySpecFacets(id);
  }
}
