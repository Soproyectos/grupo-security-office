import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { d5AssertAction } from '../../common/security/d5-action';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';

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
    private prisma: PrismaService,
    private acl: AclService,
    @Optional() private readonly grants?: AccessAssignmentsService,
  ) {}

  private async assertEditable(
    id: string,
    ctx: AccessContext | undefined,
    product: { listaId: string | null },
  ): Promise<void> {
    await d5AssertAction(this.grants, 'products:write', ctx, {
      id, kind: 'product', productId: id, listId: product.listaId ?? undefined,
    });
    // Espejo de products.service.update: la comprobación por Lista solo aplica
    // cuando el producto tiene Lista dueña (productos sueltos no tienen ACL de lista).
    if (product.listaId) {
      await this.acl.assertProductAccess(id, ctx, 'edit_products');
    }
  }

  /** Última versión vigente de revisiones del producto (cualquier estado). */
  private async latestVersion(productId: string): Promise<number> {
    const rows = await this.prisma.productRevision.findMany({
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
    await d5AssertAction(this.grants, 'products:write', ctx);
    if (!dto || typeof dto.content !== 'object' || dto.content === null) {
      throw new BadRequestException('El borrador requiere content');
    }
    if (dto.expectedVersion !== undefined && (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 0)) {
      throw new BadRequestException('expectedVersion debe ser un entero >= 0');
    }
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, listaId: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await this.assertEditable(id, ctx, product);

    const latest = await this.latestVersion(id);
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== latest) {
      throw new ConflictException({
        code: 'revision-version-conflict',
        message: `La revisión cambió (última versión ${latest}). Revisa la versión nueva antes de volver a guardar.`,
        currentVersion: latest,
      });
    }

    const draft = await this.prisma.productRevision.findFirst({
      where: { productId: id, status: { not: 'PUBLICADA' as never } },
      orderBy: { version: 'desc' },
    });
    const nextVersion = latest + 1;
    const createdById = ctx?.userId ?? null;
    // CAT-04 (D2): las referencias de medios (imágenes y recursos de ficha) las
    // construye SIEMPRE el servidor desde las filas vivas — el cuerpo del
    // cliente no puede forjarlas. Es lo que permite que «sustituir imagen no
    // rompa la revisión pública anterior» (lente §public-revision-lens).
    const media = await this.buildMediaSnapshot(id);
    const content = { ...dto.content, images: media.images, catalogResources: media.catalogResources };

    if (draft) {
      // Actualiza SOLO el borrador; jamás una revisión PUBLICADA.
      return this.prisma.productRevision.update({
        where: { id: draft.id },
        data: { version: nextVersion, content: content as Prisma.InputJsonValue, notes: dto.notes ?? draft.notes },
      });
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
    return this.prisma.productRevision.create({ data: createData });
  }

  /**
   * CAT-04 (D2): foto de los medios del producto en su estado vivo. Imágenes
   * ordenadas por `sortOrder` (orden de tienda, diseño :212) y recursos de
   * ficha por `position`. Incluye el `id` para que el mapper público conserve
   * su forma.
   */
  private async buildMediaSnapshot(productId: string) {
    const [images, catalogResources] = await Promise.all([
      this.prisma.productImage.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, url: true, alt: true, isPrimary: true, type: true, sortOrder: true },
      }),
      this.prisma.productCatalogResource.findMany({
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
    return { images, catalogResources };
  }

  /**
   * CAT-02 backend-alternativas — enruta una edición legacy a la política de
   * revisiones: crea REVISION_PENDIENTE con el contenido vivo resultante
   * (DISENO-CATALOGO:187 «tras un cambio se marca la revisión como pendiente»).
   * La revisión PUBLICADA y la presentación pública NO cambian (lente activo).
   * Marca/categoría compartida: fuera de aquí (política de afectados → CAT-06/K5).
   */
  async markPendingFromLive(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return null;
    const latest = await this.latestVersion(productId);
    // CAT-04 (D2): el snapshot legacy también foto los medios vivos (imágenes y
    // recursos) — sustituir una imagen tras este marcado no rompe la revisión
    // PUBLICADA anterior, y la retención de bytes (D3) protege el URL referenciado.
    const media = await this.buildMediaSnapshot(productId);
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
      updatedAt: product.updatedAt,
    } as Prisma.InputJsonValue;
    return this.prisma.productRevision.create({
      data: {
        id: randomUUID(),
        productId,
        status: 'REVISION_PENDIENTE',
        version: latest + 1,
        content,
        notes: 'Cambio legacy (ruta antigua) pendiente de revisión',
      },
    });
  }

  /** Resúmenes de versiones (sin `content`) ordenadas por versión desc. */
  async listRevisions(id: string, ctx?: AccessContext): Promise<RevisionSummary[]> {
    await d5AssertAction(this.grants, 'products:read', ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, listaId: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await d5AssertAction(this.grants, 'products:read', ctx, {
      id, kind: 'product', productId: id, listId: product.listaId ?? undefined,
    });
    if (product.listaId) await this.acl.assertProductAccess(id, ctx, 'view');
    return this.prisma.productRevision.findMany({
      where: { productId: id },
      select: REVISION_SUMMARY_SELECT,
      orderBy: { version: 'desc' },
    });
  }
}
