import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PublicCatalogService } from '../public-catalog.service';
import type { ProductDetailDto } from './dto/product-detail.dto';
import { toProductDetailDto, productDetailInclude, type ProductRecord } from './product.mapper';
import { applyRevisionLens, loadActiveRevisionContents } from '../public-revision-lens';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

@Injectable()
export class PublicProductDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: PublicCatalogService,
  ) {}

  /**
   * Resolves a product id (any PUBLISHED product) or a published catalog slug.
   * Visibility, price and base data come from `PublicCatalogService.getDetail`,
   * so this sheet exposes exactly what `GET /api/public/products/:id` exposes.
   */
  async findByIdOrSlug(idOrSlug: string): Promise<ProductDetailDto> {
    const id = await this.resolveId(idOrSlug);

    const [base, enriched] = await Promise.all([
      this.catalog.getDetail(id),
      this.prisma.product.findUnique({ where: { id }, include: productDetailInclude }),
    ]);
    if (!enriched) throw new NotFoundException('Producto no encontrado');

    // CAT-02: el sheet también respeta el snapshot activo (catalogName/catalogModel/…)
    const contents = await loadActiveRevisionContents(this.prisma, [(enriched as { publicRevisionId?: string | null }).publicRevisionId]);
    const lensed = applyRevisionLens(enriched as never, contents);

    return toProductDetailDto(lensed as unknown as ProductRecord, base);
  }

  private async resolveId(idOrSlug: string): Promise<string> {
    if (UUID.test(idOrSlug)) return idOrSlug;
    if (!SLUG.test(idOrSlug)) throw new BadRequestException('Identificador de producto inválido');

    const bySlug = await this.prisma.product.findFirst({
      where: { catalogSlug: idOrSlug, catalogPublished: true },
      select: { id: true },
    });
    if (!bySlug) throw new NotFoundException('Producto no encontrado');
    return bySlug.id;
  }
}
