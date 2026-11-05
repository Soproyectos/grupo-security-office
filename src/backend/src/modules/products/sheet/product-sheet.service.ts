import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Prisma as LibraryPrisma } from '../../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { directLegacyProductLibrary } from '../product-library';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { concessionCanAction } from '../../../common/security/d5-action';
import { assertGlobalGrant } from '../../../common/security/require-grant';

import { AuditService } from '../../audit/audit.service';
import { ProductRevisionsService } from '../product-revisions.service';
import { FILES_URL_PREFIX } from '../../files/files.service';
import { productDetailInclude } from '../public-detail/product.mapper';
import { ClassificationService } from '../classification/classification.service';
import type { ClassificationDb } from '../classification/classification.types';
import {
  ProductSheetView,
  SHEET_FEATURE_ICONS,
  SheetFeatureIcon,
  SheetResourceKind,
  UpdateProductSheetDto,
} from './dto/product-sheet.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lowercase, accent-free, dash-separated key derived from free text. */
export function slugifyKey(text: string, maxLength = 64): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/** Returns `base` or `base-2`, `base-3`… so that it is not in `taken`; records it. */
function uniqueKey(base: string, taken: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-${n++}`.slice(-64);
  taken.add(candidate);
  return candidate;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function cleanList(values: string[], { dedupe = false }: { dedupe?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    if (dedupe && out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function required(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestException(message);
  return trimmed;
}

/** Normalized, validated shape ready to be persisted. */
export interface NormalizedSheet {
  name: string | null;
  slug: string | null;
  published: boolean;
  status: 'ACTIVE' | 'DISCONTINUED';
  brand: string | null;
  model: string | null;
  badges: string[];
  highlights: string[];
  features: { id: string; label: string; icon: SheetFeatureIcon }[];
  availableModels: string[];
  imageUrl: string | null;
  imageAlt: string | null;
  specsDisclaimer: string | null;
  firmwareNote: string | null;
  /** CAT-03 (H4): identificadores del fabricante. */
  manufacturerRefs: string[];
  specGroups: { key: string; title: string; items: { label: string; value: string }[] }[];
  resources: {
    kind: SheetResourceKind;
    title: string;
    language: string;
    url: string;
    fileName: string | null;
    version: string | null;
    region: string | null;
    requiresLicense: boolean;
  }[];
}

/**
 * Trims, drops blanks, derives stable keys and enforces cross-field rules that
 * class-validator cannot express (published needs a slug, unique keys, ...).
 */
export function normalizeSheet(dto: UpdateProductSheetDto): NormalizedSheet {
  const slug = text(dto.slug);
  if (slug && UUID.test(slug)) {
    throw new BadRequestException('El slug no puede tener formato de UUID');
  }
  if (dto.published && !slug) {
    throw new BadRequestException('Una ficha publicada necesita un slug');
  }

  const featureKeys = new Set<string>();
  const features = dto.features.map((f, index) => {
    const label = required(f.label, 'Cada característica necesita un texto');
    if (!SHEET_FEATURE_ICONS.includes(f.icon)) throw new BadRequestException('Ícono no permitido');
    const base = f.id ?? (slugifyKey(label) || `caracteristica-${index + 1}`);
    return { id: uniqueKey(base, featureKeys), label, icon: f.icon };
  });

  const groupKeys = new Set<string>();
  const specGroups = dto.specGroups.map((g, index) => {
    const title = required(g.title, 'Cada grupo necesita un título');
    const base = g.key ?? (slugifyKey(title) || `grupo-${index + 1}`);
    return {
      key: uniqueKey(base, groupKeys),
      title,
      items: g.items.map((i) => ({
        label: required(i.label, 'Cada especificación necesita un nombre'),
        value: required(i.value, 'Cada especificación necesita un valor'),
      })),
    };
  });

  const resources = dto.resources.map((r) => ({
    kind: r.kind,
    title: required(r.title, 'Cada documento necesita un título'),
    language: r.language.trim().toLowerCase(),
    url: r.url.trim(),
    fileName: text(r.fileName),
    version: text(r.version),
    region: text(r.region),
    requiresLicense: r.requiresLicense,
  }));

  return {
    name: text(dto.name),
    slug,
    published: dto.published,
    status: dto.status,
    brand: text(dto.brand),
    model: text(dto.model),
    badges: cleanList(dto.badges, { dedupe: true }),
    highlights: cleanList(dto.highlights),
    features,
    availableModels: cleanList(dto.availableModels, { dedupe: true }),
    imageUrl: text(dto.imageUrl),
    imageAlt: text(dto.imageAlt),
    specsDisclaimer: text(dto.specsDisclaimer),
    firmwareNote: text(dto.firmwareNote),
    manufacturerRefs: cleanList(dto.manufacturerRefs ?? [], { dedupe: true }),
    specGroups,
    resources,
  };
}

// `subcategoryId` is optional here: the dedicated-library client types (LibraryPrisma) do not declare it yet.
type ProductWithSheet = Omit<Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>, 'subcategoryId'> & { subcategoryId?: string | null };

/**
 * Admin read/write of the public product sheet ("ficha"): the enriched `catalog*`
 * columns plus spec groups/items and resources. Identity (`name`, `nameSource`,
 * `sku`) is never touched here, and the list-import pipeline never writes these
 * columns/tables, so a re-import cannot overwrite the sheet.
 */
@Injectable()
export class ProductSheetService {
  constructor(
    prisma: PrismaService,
    private readonly acl: AclService,
    private readonly audit: AuditService,
    /**
     * CAT-03 §4: lectura/edición de la ficha exige su acción del catálogo
     * (`products:read` / `products:write`), y las notas internas su acción
     * propia (`products:notes`). Opcional para conservar la construcción de 3
     * argumentos de los specs preexistentes; Nest lo inyecta (SecurityModule es
     * @Global). Legados SIN grants conservan la capa ACL/rol (transición D5).
     */
    @Optional() private readonly grants?: AccessAssignmentsService,
    /**
     * CAT-03 H5 (regla 5): editar la ficha INVALIDA la validación — marca
     * revisión pendiente usando el mecanismo CAT-02 (`markPendingFromLive`),
     * exactamente como las rutas legacy (`products.service.update`). Opcional
     * por el mismo motivo que `grants`. La presentación pública NO cambia: el
     * lente público sigue leyendo `Product.publicRevisionId`.
     */
    @Optional() private readonly revisions?: ProductRevisionsService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
    @Inject(LibraryAuditService) private readonly libraryAudit: LibraryAuditService = new LibraryAuditService(library),
    @Optional() private readonly classification: ClassificationService = new ClassificationService(),
  ) {}

  private get prisma() { return this.library.client; }

  private async canAct(actionId: string, ctx: AccessContext, product?: { id: string; listaId: string | null }): Promise<boolean> {
    // Enmienda 2026-10-18: modelo estricto — sin Super Admin explícito ni
    // concesión vigente para la accion, DENEGAR (no reactiva el rol heredado).
    return (await concessionCanAction(this.grants, actionId, ctx, product ? {
      id: product.id, kind: 'product', productId: product.id, listId: product.listaId ?? undefined,
    } : undefined)).allowed;
  }

  private async assertAction(actionId: string, ctx: AccessContext, product?: { id: string; listaId: string | null }): Promise<void> {
    if (!(await this.canAct(actionId, ctx, product))) {
      throw new ForbiddenException(`Sin permiso ${actionId}`);
    }
  }

  private async authorizeProduct(id: string, actionId: string, ctx: AccessContext): Promise<void> {
    // Solo la concesion global de panel (nunca por cargo ni por Listas); 403 antes de cargar la ficha.
    await assertGlobalGrant(this.grants, actionId, ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
  }

  async get(id: string, ctx?: AccessContext): Promise<ProductSheetView> {
    if (ctx) await this.authorizeProduct(id, 'products:read', ctx);
    const product = await this.load(id);
    const withNotes = ctx ? await this.canAct('products:notes', ctx, product) : true;
    return this.withClassification(this.toView(product, { withNotes }), product);
  }

  async update(id: string, dto: UpdateProductSheetDto, ctx?: AccessContext): Promise<ProductSheetView> {
    if (ctx) await this.authorizeProduct(id, 'products:write', ctx);
    const before = await this.load(id);

    // CAT-03 §4: acción del catálogo (`products:write`) además de la capa de
    // ACL/rol existente (edit_products sobre la Lista del producto).
    await this.assertListaEditable(before.listaId);

    // CAT-03 H2 (OCC): si la ficha cambió desde que el cliente la leyó → 409
    // ANTES de cualquier escritura (no se pierde lo escrito ni se pisa lo nuevo).
    const withNotes = ctx ? await this.canAct('products:notes', ctx, before) : true;
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== before.sheetVersion) {
      throw new ConflictException({
        code: 'sheet-version-conflict',
        message: `La ficha cambió (versión vigente ${before.sheetVersion}). Revisa la versión nueva antes de volver a guardar.`,
        currentVersion: before.sheetVersion,
        // El filtro global solo reenvía `feedback` (lista de strings): es el canal
        // sanctioned para que el cliente vea el detalle del conflicto por HTTP.
        feedback: [`sheet-version-conflict: la versión vigente de la ficha es ${before.sheetVersion}`],
      });
    }

    const sheet = normalizeSheet(dto);

    // The sheet may (re)classify the product: subcategoryId is the truth and categoryId is derived from it.
    const classified = dto.subcategoryId !== undefined
      ? await this.classification.assertWritable(
        this.prisma as unknown as ClassificationDb,
        { subcategoryId: dto.subcategoryId },
        { categoryId: before.categoryId, subcategoryId: before.subcategoryId, brandId: before.brandId },
      )
      : null;

    // Internal notes are no longer part of the sheet: they live in `ProductInternalNote`
    // (see ProductInternalNotesService). This PUT neither reads nor writes them, and the
    // obsolete column `catalogInternalNotes` is left untouched until it is removed.

    if (sheet.slug) {
      const taken = await this.prisma.product.findFirst({
        where: { catalogSlug: sheet.slug, NOT: { id } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Ya existe otro producto con ese slug');
    }

    try {
      await this.library.writeTransaction(async (tx) => {
        if (this.library.config.mode === 'dedicated') {
          await tx.$queryRaw`SELECT id FROM products WHERE id=${id} FOR UPDATE`;
          const current = await tx.product.findUnique({ where: { id }, select: { sheetVersion: true } });
          if (!current) throw new NotFoundException('Producto no encontrado');
          if (current.sheetVersion !== before.sheetVersion) {
            throw new ConflictException({ code: 'sheet-version-conflict', currentVersion: current.sheetVersion, message: 'La ficha cambió. Recarga antes de guardar.' });
          }
        }
        await tx.product.update({
          where: { id },
          data: {
            ...(classified && this.classification.toData(classified)),
            catalogName: sheet.name,
            catalogSlug: sheet.slug,
            catalogPublished: sheet.published,
            catalogStatus: sheet.status,
            catalogBrand: sheet.brand,
            catalogModel: sheet.model,
            catalogBadges: sheet.badges,
            catalogHighlights: sheet.highlights,
            catalogFeatures: sheet.features as unknown as Prisma.InputJsonValue,
            catalogAvailableModels: sheet.availableModels,
            catalogImageUrl: sheet.imageUrl,
            catalogImageAlt: sheet.imageAlt,
            catalogSpecsDisclaimer: sheet.specsDisclaimer,
            catalogFirmwareNote: sheet.firmwareNote,
            catalogManufacturerRefs: sheet.manufacturerRefs,
            sheetVersion: { increment: 1 },
          },
        });

        // Full replacement; spec items go with their group (ON DELETE CASCADE).
        await tx.productCatalogSpecGroup.deleteMany({ where: { productId: id } });
        for (const [groupIndex, group] of sheet.specGroups.entries()) {
          await tx.productCatalogSpecGroup.create({
            data: {
              productId: id,
              key: group.key,
              title: group.title,
              position: groupIndex,
              items: {
                create: group.items.map((item, itemIndex) => ({
                  label: item.label,
                  value: item.value,
                  position: itemIndex,
                })),
              },
            },
          });
        }

        await tx.productCatalogResource.deleteMany({ where: { productId: id } });
        if (sheet.resources.length > 0) {
          await tx.productCatalogResource.createMany({
            data: sheet.resources.map((r, position) => ({ productId: id, position, ...r })),
          });
        }

        // CAT-04 (D4, caso «medio privado inaccesible por ID/URL directa»):
        // un recurso cuyo archivo es propio (`/api/files/<id>`) y exige
        // licencia pasa a PRIVATE con este producto como dueño; un archivo que
        // deja de exigir licencia vuelve a PUBLIC. Nunca se roba la propiedad
        // de un archivo dueño de OTRO producto.
        const FILE_PREFIX = `${FILES_URL_PREFIX}/`;
        const licensed = new Set(
          sheet.resources
            .filter((r) => r.requiresLicense && typeof r.url === 'string' && r.url.startsWith(FILE_PREFIX))
            .map((r) => r.url),
        );
        for (const url of licensed) {
          const fileId = url.slice(FILE_PREFIX.length);
          await tx.uploadedFile.updateMany({
            where: { id: fileId, OR: [{ ownerProductId: null }, { ownerProductId: id }] },
            data: { visibility: 'PRIVATE', ownerProductId: id },
          });
        }
        const owned = await tx.uploadedFile.findMany({
          where: { ownerProductId: id },
          select: { id: true },
        });
        for (const f of owned) {
          const url = `${FILE_PREFIX}${f.id}`;
          if (!licensed.has(url)) {
            await tx.uploadedFile.update({ where: { id: f.id }, data: { visibility: 'PUBLIC' } });
          }
        }
        if (this.library.config.mode === 'dedicated') {
          await this.revisions?.markPendingFromLive(id, tx, { id: ctx?.userId });
          await this.libraryAudit.append(tx, {
            actor: { id: ctx?.userId }, action: 'PRODUCT_SHEET_UPDATED', entityType: 'Product', entityId: id,
            summary: {
              before: this.auditSnapshot(this.toView(before, { withNotes })) as unknown as LibraryPrisma.InputJsonObject,
              after: this.auditSnapshot(this.toView(await tx.product.findUniqueOrThrow({ where: { id }, include: productDetailInclude }), { withNotes })) as unknown as LibraryPrisma.InputJsonObject,
            },
          });
        }
      });
    } catch (error) {
      if ((error instanceof Prisma.PrismaClientKnownRequestError || error instanceof LibraryPrisma.PrismaClientKnownRequestError) && error.code === 'P2002') {
        // Lost a race on the unique slug (or a spec group key).
        throw new ConflictException('Ya existe otro producto con ese slug');
      }
      throw error;
    }

    const reloaded = await this.load(id);
    const after = this.toView(reloaded, { withNotes });
    if (this.library.config.mode === 'legacy') await this.audit.log({
      userId: ctx?.userId,
      action: 'update_sheet',
      entity: 'Product',
      entityId: id,
      oldValues: this.auditSnapshot(this.toView(before, { withNotes })),
      newValues: this.auditSnapshot(after),
    });
    // CAT-03 H5 (regla 5): el cambio deja la validación PENDIENTE — mismo
    // mecanismo CAT-02 que usan las rutas legacy. No autoriza ni publica nada:
    // el lente público sigue sirviendo `publicRevisionId` sin tocar.
    if (this.library.config.mode === 'legacy') await this.revisions?.markPendingFromLive(id);
    return this.withClassification(after, reloaded);
  }

  /** Read-only classification context of the sheet; kept out of `toView` so audit snapshots and the public mapper stay unchanged. */
  private async withClassification(view: ProductSheetView, p: ProductWithSheet): Promise<ProductSheetView> {
    const subcategoryId = p.subcategoryId ?? null;
    const subcategoryDelegate = (this.prisma as unknown as { subcategory?: { findUnique(args: unknown): Promise<{ id: string; name: string; slug: string } | null> } }).subcategory;
    const subcategory = subcategoryId && subcategoryDelegate
      ? await subcategoryDelegate.findUnique({ where: { id: subcategoryId }, select: { id: true, name: true, slug: true } })
      : null;
    return { ...view, subcategoryId, subcategory, classificationStatus: subcategoryId && p.brandId ? 'complete' : 'incomplete' };
  }

  private async load(id: string): Promise<ProductWithSheet> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productDetailInclude,
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  private async assertListaEditable(listaId: string | null): Promise<void> {
    if (!listaId) return;
    const lista = (await this.prisma.lista.findUnique({ where: { id: listaId } })) as unknown as {
      deletionStatus: string | null;
    } | null;
    if (lista?.deletionStatus === 'PENDING_DELETION') {
      throw new ConflictException({
        code: 'LISTA_PENDIENTE_ELIMINACION',
        message: 'La Lista está pendiente de eliminación y no permite cambios.',
      });
    }
  }

  private toView(p: ProductWithSheet, opts: { withNotes: boolean } = { withNotes: true }): ProductSheetView {
    const features = Array.isArray(p.catalogFeatures)
      ? (p.catalogFeatures as unknown as ProductSheetView['features'])
      : [];
    return {
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      name: p.catalogName,
      slug: p.catalogSlug,
      published: p.catalogPublished,
      status: p.catalogStatus ?? 'ACTIVE',
      brand: p.catalogBrand,
      model: p.catalogModel,
      badges: p.catalogBadges,
      highlights: p.catalogHighlights,
      features,
      availableModels: p.catalogAvailableModels,
      imageUrl: p.catalogImageUrl,
      imageAlt: p.catalogImageAlt,
      specsDisclaimer: p.catalogSpecsDisclaimer,
      firmwareNote: p.catalogFirmwareNote,
      manufacturerRefs: p.catalogManufacturerRefs ?? [],
      // Whether the actor may open the internal-notes list (served by /internal-notes).
      canSeeInternalNotes: opts.withNotes,
      version: p.sheetVersion,
      specGroups: p.catalogSpecGroups.map((g) => ({
        key: g.key,
        title: g.title,
        items: g.items.map((i) => ({ label: i.label, value: i.value })),
      })),
      resources: p.catalogResources.map((r) => ({
        kind: r.kind,
        title: r.title,
        language: r.language,
        url: r.url,
        fileName: r.fileName,
        version: r.version,
        region: r.region,
        requiresLicense: r.requiresLicense,
      })),
      updatedAt: p.updatedAt,
    };
  }

  /** Audit payload: the editable sheet only (no read-only context, no timestamps). */
  private auditSnapshot(view: ProductSheetView) {
    const { productId: _productId, sku: _sku, productName: _productName, updatedAt: _updatedAt, subcategoryId: _subcategoryId, subcategory: _subcategory, classificationStatus: _classificationStatus, ...sheet } = view;
    return sheet;
  }
}
