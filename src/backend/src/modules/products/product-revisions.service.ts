import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService, type LibraryActor } from '../library-audit/library-audit.service';
import { directLegacyProductLibrary, productLibraryWrite } from './product-library';
import { randomUUID } from 'crypto';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { assertGlobalGrant } from '../../common/security/require-grant';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { SHEET_SNAPSHOT_VERSION, SHEET_SNAPSHOT_VERSION_KEY } from './public-revision-lens';

/**
 * CAT-02 backend-borradores — borradores versionados de producto.
 *
 * Reglas (contrato CAT-02 §3/§5, ficha «Editar no cambia publicado; dos
 * editores no se pisan»):
 *  - Guardar borrador crea/actualiza UNA revisión NO publicada con `version`
 *    creciente; la revisión PUBLICADA y la fila del producto (activos
 *    protegidos: imágenes, precios, medios) jamás se escriben aquí.
 *  - OCC: si el cliente envía `expectedVersion` y no coincide con la última
 *    versión vigente → 409 `revision-version-conflict`. Sin `expectedVersion`
 *    la última versión gana (optimista opcional, documentado).
 *  - ACL idéntica a `products.update` (edit_products sobre el producto/Lista).
 */
export interface SaveDraftDto {
  content: Record<string, unknown>;
  notes?: string;
  expectedVersion?: number;
}

export interface RevisionSummary {
  id: string;
  version: number;
  status: string;
  notes: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

const REVISION_SUMMARY_SELECT = {
  id: true,
  version: true,
  status: true,
  notes: true,
  publishedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ProductRevisionsService {
  constructor(
    prisma: PrismaService,
    private acl: AclService,
    @Optional() private readonly grants?: AccessAssignmentsService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
    @Inject(LibraryAuditService) private readonly audit: LibraryAuditService = new LibraryAuditService(library),
  ) {}

  private get prisma() { return this.library.client; }

  private async assertEditable(
    id: string,
    ctx: AccessContext | undefined,
    product: { listaId: string | null },
  ): Promise<void> {
    // Solo la concesion global `products:write` (nunca por cargo ni por Listas).
    await assertGlobalGrant(this.grants, 'products:write', ctx);
  }

  /** Última versión vigente de revisiones del producto (cualquier estado). */
  private async latestVersion(productId: string, client: Prisma.TransactionClient = this.prisma): Promise<number> {
    const rows = await client.productRevision.findMany({
      where: { productId },
      select: { version: true },
      orderBy: { version: 'desc' },
      take: 1,
    });
    return rows[0]?.version ?? 0;
  }

  /**
   * Guarda (crea o actualiza) el borrador del producto. Solo escribe sobre
   * `product_revisions` (nunca sobre `products`/medios) y nunca sobre una
   * revisión PUBLICADA.
   */
  async saveDraft(id: string, dto: SaveDraftDto, ctx?: AccessContext) {
    await assertGlobalGrant(this.grants, 'products:write', ctx);
    if (!dto || typeof dto.content !== 'object' || dto.content === null) {
      throw new BadRequestException('El borrador requiere content');
    }
    if (dto.expectedVersion !== undefined && (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 0)) {
      throw new BadRequestException('expectedVersion debe ser un entero >= 0');
    }
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, listaId: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await this.assertEditable(id, ctx, product);

    return productLibraryWrite(this.library, async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM products WHERE id=${id} FOR UPDATE`;
      const latest = await this.latestVersion(id, tx);
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== latest) {
        throw new ConflictException({
          code: 'revision-version-conflict',
          message: `La revisión cambió (última versión ${latest}). Revisa la versión nueva antes de volver a guardar.`,
          currentVersion: latest,
        });
      }

      const draft = await tx.productRevision.findFirst({
        where: { productId: id, status: { not: 'PUBLICADA' as never } },
        orderBy: { version: 'desc' },
      });
      const nextVersion = latest + 1;
      const createdById = ctx?.userId ?? null;
      // CAT-04 (D2): las referencias de medios (imágenes y recursos de ficha) las
      // construye SIEMPRE el servidor desde las filas vivas — el cuerpo del
      // cliente no puede forjarlas. Es lo que permite que «sustituir imagen no
      // rompa la revisión pública anterior» (lente §public-revision-lens).
      const media = await this.buildMediaSnapshot(id, tx);
      // The client can never set the snapshot version marker: the server builds it.
      const { [SHEET_SNAPSHOT_VERSION_KEY]: _ignoredMarker, ...clientContent } = (dto.content ?? {}) as Record<string, unknown>;
      const content = { ...clientContent, images: media.images, catalogResources: media.catalogResources, ...media.sheet };

      if (draft) {
        // Actualiza SOLO el borrador; jamás una revisión PUBLICADA.
        const result = await tx.productRevision.update({
          where: { id: draft.id },
          data: { version: nextVersion, content: content as Prisma.InputJsonValue, notes: dto.notes ?? draft.notes },
        });
        await this.recordSaved(tx, result, { id: ctx?.userId }, 'REVISION_DRAFT_SAVED');
        return result;
      }
      const createData: Prisma.ProductRevisionUncheckedCreateInput = {
        id: randomUUID(),
        productId: id,
        createdById,
        status: 'SIN_REVISAR',
        version: nextVersion,
        content: content as Prisma.InputJsonValue,
        notes: dto.notes,
      };
      const result = await tx.productRevision.create({ data: createData });
      await this.recordSaved(tx, result, { id: ctx?.userId }, 'REVISION_DRAFT_SAVED');
      return result;
    });
  }

  /**
   * CAT-04 (D2): foto de los medios del producto en su estado vivo. Imágenes
   * ordenadas por `sortOrder` (orden de tienda, diseño :212) y recursos de
   * ficha por `position`. Incluye el `id` para que el mapper público conserve
   * su forma.
   */
  private async buildMediaSnapshot(productId: string, client: Prisma.TransactionClient = this.prisma) {
    const [images, catalogResources] = await Promise.all([
      client.productImage.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, url: true, alt: true, isPrimary: true, type: true, sortOrder: true },
      }),
      client.productCatalogResource.findMany({
        where: { productId },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          kind: true,
          title: true,
          language: true,
          url: true,
          fileName: true,
          version: true,
          region: true,
          requiresLicense: true,
          position: true,
        },
      }),
    ]);
    const sheet = await this.buildSheetSnapshot(productId, client);
    return { images, catalogResources, sheet };
  }

  /**
   * Published-isolation: the detailed sheet (spec groups with items, highlights,
   * badges, features and the hero image) is frozen in the revision, built by the
   * server from the live rows. The public sheet reads it from the PUBLISHED
   * revision, so editing the draft never changes what the public sees.
   * Legacy revisions lack these keys and fall back to the live rows (lens).
   */
  private async buildSheetSnapshot(productId: string, client: Prisma.TransactionClient): Promise<Record<string, unknown>> {
    const row = await client.product.findUnique({
      where: { id: productId },
      select: {
        categoryId: true,
        brandId: true,
        catalogSlug: true,
        catalogHighlights: true,
        catalogBadges: true,
        catalogFeatures: true,
        catalogImageUrl: true,
        catalogImageAlt: true,
        catalogStatus: true,
        catalogSpecsDisclaimer: true,
        catalogAvailableModels: true,
        catalogFirmwareNote: true,
        catalogSpecGroups: {
          orderBy: { position: 'asc' },
          select: { key: true, title: true, items: { orderBy: { position: 'asc' }, select: { label: true, value: true } } },
        },
      },
    });
    if (!row) return {};
    // `subcategoryId` only exists on the shared (legacy) database; the dedicated library schema has no
    // such column, so there the key is simply absent and the public view falls back to the live value.
    const subcategory = this.library.config.mode === 'legacy'
      ? await client.$queryRaw<Array<{ subcategoryId: string | null }>>`SELECT "subcategoryId" FROM products WHERE id = ${productId}`
      : null;
    return {
      ...(subcategory?.[0] ? { subcategoryId: subcategory[0].subcategoryId } : {}),
      // Identity used by public search/filters/facets/slug: built from the live row, never client-supplied.
      categoryId: row.categoryId,
      brandId: row.brandId,
      catalogSlug: row.catalogSlug,
      catalogHighlights: row.catalogHighlights,
      catalogBadges: row.catalogBadges,
      catalogFeatures: row.catalogFeatures,
      catalogImageUrl: row.catalogImageUrl,
      catalogImageAlt: row.catalogImageAlt,
      catalogSpecGroups: row.catalogSpecGroups,
      catalogStatus: row.catalogStatus,
      catalogSpecsDisclaimer: row.catalogSpecsDisclaimer,
      catalogAvailableModels: row.catalogAvailableModels,
      catalogFirmwareNote: row.catalogFirmwareNote,
      // Server-only version marker: from v2 on, snapshot keys are authoritative (null included).
      [SHEET_SNAPSHOT_VERSION_KEY]: SHEET_SNAPSHOT_VERSION,
    };
  }

  /**
   * CAT-02 backend-alternativas — enruta una edición legacy a la política de
   * revisiones: crea REVISION_PENDIENTE con el contenido vivo resultante
   * (DISENO-CATALOGO:187 «tras un cambio se marca la revisión como pendiente»).
   * La revisión PUBLICADA y la presentación pública NO cambian (lente activo).
   * Marca/categoría compartida: fuera de aquí (política de afectados → CAT-06/K5).
   */
  async markPendingFromLive(productId: string, transaction?: Prisma.TransactionClient, actor?: LibraryActor) {
    return productLibraryWrite(this.library, async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM products WHERE id=${productId} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) return null;
      const latest = await this.latestVersion(productId, tx);
      // CAT-04 (D2): el snapshot legacy también foto los medios vivos (imágenes y
      // recursos) — sustituir una imagen tras este marcado no rompe la revisión
      // PUBLICADA anterior, y la retención de bytes (D3) protege el URL referenciado.
      const media = await this.buildMediaSnapshot(productId, tx);
      const content = {
        sku: product.sku,
        name: product.name,
        description: product.description,
        technicalSpecs: product.technicalSpecs,
        documents: product.documents,
        catalogName: product.catalogName,
        catalogModel: product.catalogModel,
        catalogBrand: product.catalogBrand,
        categoryId: product.categoryId,
        brandId: product.brandId,
        listaId: product.listaId,
        images: media.images,
        catalogResources: media.catalogResources,
        ...media.sheet,
        updatedAt: product.updatedAt,
      } as Prisma.InputJsonValue;
      const result = await tx.productRevision.create({
        data: {
          id: randomUUID(),
          productId,
          status: 'REVISION_PENDIENTE',
          version: latest + 1,
          content,
          notes: 'Cambio legacy (ruta antigua) pendiente de revisión',
        },
      });
      await this.recordSaved(tx, result, actor, 'REVISION_PENDING_FROM_LIVE');
      return result;
    }, transaction);
  }

  private recordSaved(tx: Prisma.TransactionClient, revision: { id: string; productId: string; version: number; status: string }, actor: LibraryActor | undefined, action: string) {
    if (this.library.config.mode === 'legacy') return Promise.resolve(null);
    return this.audit.append(tx, { actor, action, entityType: 'ProductRevision', entityId: revision.id, summary: { productId: revision.productId, version: revision.version, status: revision.status } });
  }

  /** Resúmenes de versiones (sin `content`) ordenadas por versión desc. */
  async listRevisions(id: string, ctx?: AccessContext): Promise<RevisionSummary[]> {
    await assertGlobalGrant(this.grants, 'products:read', ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return this.prisma.productRevision.findMany({
      where: { productId: id },
      select: REVISION_SUMMARY_SELECT,
      orderBy: { version: 'desc' },
    });
  }
}
