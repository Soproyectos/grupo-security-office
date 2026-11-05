import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCatalogService } from './public-catalog.service';

/** Store filters built from the PUBLISHED key specs of the products visible in the public catalog. */
@ApiTags('Public Products')
@Controller('api/public/catalog')
export class PublicCatalogKeySpecFacetsController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('key-spec-facets')
  @ApiOperation({ summary: 'Filter facets (key specs) of a subcategory; a product listing filter uses `keySpec=<specKey>:<value>`' })
  facets(@Query('subcategoryId') subcategoryId: string | undefined, @Res({ passthrough: true }) res: Response) {
    const id = subcategoryId?.trim();
    if (!id || id.length > 64) throw new BadRequestException('subcategoryId es obligatorio');
    res.setHeader('Cache-Control', 'private, no-store');
    return this.catalog.keySpecFacets(id);
  }
}
