import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { RequireGrant } from '../../../common/security/require-grant';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { ProductDetailDto } from './dto/product-detail.dto';
import { PublicProductDetailService } from './public-product-detail.service';

/** Admin draft preview of the public sheet. Read-only; works for products that are not public yet. */
@ApiTags('Product preview')
@ApiBearerAuth()
@Controller('api/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductPreviewDetailController {
  constructor(private readonly service: PublicProductDetailService) {}

  @Get(':id/preview-detail')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Public sheet built with the DRAFT key specs, marked as a preview. Never writes.' })
  preview(@Param('id') id: string): Promise<ProductDetailDto> {
    return this.service.previewById(id);
  }
}
