import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { concessionCanAction } from '../../../common/security/d5-action';

import { AuditService } from '../../audit/audit.service';
import { ProductRevisionsService } from '../product-revisions.service';
import { FILES_URL_PREFIX } from '../../files/files.service';
import { productDetailInclude } from '../public-detail/product.mapper';
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
  /** CAT-03 (H1): notas internas (nunca públicas). */
  internalNotes: string | null;
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
    internalNotes: text(dto.internalNotes),
    specGroups,
    resources,
  };
}

type ProductWithSheet = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

/**
 * Admin read/write of the public product sheet ("ficha"): the enriched `catalog*`
 * columns plus spec groups/items and resources. Identity (`name`, `nameSource`,
 * `sku`) is never touched here, and the list-import pipeline never writes these
 * columns/tables, so a re-import cannot overwrite the sheet.
 */
@Injectable()
export class ProductSheetService {
  constructor(
    private readonly prisma: PrismaService,
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
  ) {}

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

  private async authorizeProduct(id: string, actionId: string, ctx: AccessContext, level: string): Promise<void> {
    // Reject users without the action before loading protected sheet relations.
    await this.assertAction(actionId, ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, listaId: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await this.assertAction(actionId, ctx, product);
    await this.acl.assertProductAccess(id, ctx, level);
  }

  async get(id: string, ctx?: AccessContext): Promise<ProductSheetView> {
    if (ctx) await this.authorizeProduct(id, 'products:read', ctx, 'view');
    const product = await this.load(id);
    const withNotes = ctx ? await this.canAct('products:notes', ctx, product) : true;
    return this.toView(product, { withNotes });
  }

  async update(id: string, dto: UpdateProductSheetDto, ctx?: AccessContext): Promise<ProductSheetView> {
    if (ctx) await this.authorizeProduct(id, 'products:write', ctx, 'edit_products');
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

    // CAT-03 H1: las notas internas se conservan si el actor no tiene
    // `products:notes` (y no se devuelven). Omitir el campo en el PUT también
    // conserva las vigentes — los clientes que aún no muestran el apartado
    // (y el editor sin la acción) no pueden borrarlas por accidente; solo un
    // `internalNotes: null` explícito de un actor con la acción las borra.
    const notesProvided = dto.internalNotes !== undefined;
    const internalNotes = withNotes && notesProvided ? sheet.internalNotes : before.catalogInternalNotes;

    if (sheet.slug) {
      const taken = await this.prisma.product.findFirst({
        where: { catalogSlug: sheet.slug, NOT: { id } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Ya existe otro producto con ese slug');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
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
            catalogInternalNotes: internalNotes,
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
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Lost a race on the unique slug (or a spec group key).
        throw new ConflictException('Ya existe otro producto con ese slug');
      }
      throw error;
    }

    const after = this.toView(await this.load(id), { withNotes });
    await this.audit.log({
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
    await this.revisions?.markPendingFromLive(id);
    return after;
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
      // CAT-03 H1: sin `products:notes` las notas internas NO se devuelven.
      internalNotes: opts.withNotes ? p.catalogInternalNotes : null,
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
    const { productId: _productId, sku: _sku, productName: _productName, updatedAt: _updatedAt, ...sheet } = view;
    return sheet;
  }
}
