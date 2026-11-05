import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '../../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../product-library';
import { PrismaService } from '../../../prisma/prisma.service';
import { PublicCatalogService } from '../public-catalog.service';
import type { ProductDetailDto } from './dto/product-detail.dto';
import { toProductDetailDto, productDetailInclude, type ProductRecord } from './product.mapper';
import { PublishedKeySpecsService } from '../../library-specs/published-key-specs.service';
import type { PublicKeySpecItem } from '../../library-specs/published-key-specs.rules';
import { applyRevisionLens, applySheetSnapshot, loadActiveRevisionContents, sheetDiffersFromSnapshot } from '../public-revision-lens';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

@Injectable()
export class PublicProductDetailService {
  constructor(
    prisma: PrismaService,
    private readonly catalog: PublicCatalogService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
    @Optional() private readonly keySpecs?: PublishedKeySpecsService,
  ) {}

  private get prisma() { return this.library.client; }

  /**
   * Resolves a product id (any PUBLISHED product) or a published catalog slug.
   * Visibility, price and base data come from `PublicCatalogService.getDetail`,
   * so this sheet exposes exactly what `GET /api/public/products/:id` exposes.
   */
  async findByIdOrSlug(idOrSlug: string): Promise<ProductDetailDto> {
    const id = await this.resolveId(idOrSlug);
    return this.build(id, async () => (await this.keySpecs?.publishedItems(id)) ?? []);
  }

  /**
   * Admin preview: the same sheet, built by the same mapper, but with the draft key specs
   * (WORKING over PUBLISHED) and without the public visibility rule. Never writes.
   */
  async previewById(id: string): Promise<ProductDetailDto> {
    let unpublishedChanges = false;
    const dto = await this.build(
      id,
      async () => {
        const draft = (await this.keySpecs?.draftPreview(id)) ?? { items: [], unpublishedChanges: false };
        unpublishedChanges = draft.unpublishedChanges;
        return draft.items;
      },
      (differs) => { unpublishedChanges = unpublishedChanges || differs; },
    );
    return { ...dto, preview: { mode: 'draft', unpublishedChanges } };
  }

  /**
   * `onPreview` set = admin preview: the detailed sheet (spec groups, highlights, badges,
   * features, images) is the LIVE/draft one and the callback reports whether it differs
   * from the published snapshot. Without it, those fields come from the PUBLISHED snapshot
   * (live rows only as fallback for legacy revisions without the new keys).
   */
  private async build(id: string, keySpecItems: () => Promise<PublicKeySpecItem[]>, onPreview?: (sheetDiffers: boolean) => void): Promise<ProductDetailDto> {
    const preview = Boolean(onPreview);
    const [base, enriched, keySpecs] = await Promise.all([
      preview ? this.catalog.getDetail(id, { skipVisibility: true }) : this.catalog.getDetail(id),
      this.prisma.product.findUnique({ where: { id }, include: productDetailInclude }),
      keySpecItems(),
    ]);
    if (!enriched) throw new NotFoundException('Producto no encontrado');

    // CAT-02: el sheet también respeta el snapshot activo (catalogName/catalogModel/…)
    const contents = await loadActiveRevisionContents(this.prisma, [(enriched as { publicRevisionId?: string | null }).publicRevisionId]);
    let lensed = applyRevisionLens(enriched as never, contents, { preview });
    if (onPreview) {
      const content = contents.get((enriched as { publicRevisionId?: string | null }).publicRevisionId ?? '');
      onPreview(sheetDiffersFromSnapshot({ ...(enriched as unknown as Record<string, unknown>), images: base.images }, content));
    } else {
      lensed = applySheetSnapshot(lensed, contents);
    }

    return toProductDetailDto(lensed as unknown as ProductRecord, base, keySpecs);
  }

  private async resolveId(idOrSlug: string): Promise<string> {
    if (UUID.test(idOrSlug)) return idOrSlug;
    if (!SLUG.test(idOrSlug)) throw new BadRequestException('Identificador de producto inválido');

    // Published-isolation: the slug is the one frozen in the PUBLISHED revision (live column only
    // when the revision lacks the key or no revision is pinned). Parameterized raw query.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id FROM products p
      LEFT JOIN product_revisions r ON r.id = p."publicRevisionId" AND r.status = 'PUBLICADA'
      WHERE p."catalogPublished" = true
        AND (CASE WHEN r.content IS NOT NULL AND jsonb_exists(r.content, 'catalogSlug')
          THEN r.content->>'catalogSlug' ELSE p."catalogSlug" END) = ${idOrSlug}
      ORDER BY p.id LIMIT 1`);
    if (!rows[0]) throw new NotFoundException('Producto no encontrado');
    return rows[0].id;
  }
}
