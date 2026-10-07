import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { AuditService } from '../../audit/audit.service';
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
  ) {}

  async get(id: string, ctx?: AccessContext): Promise<ProductSheetView> {
    const product = await this.load(id);
    if (ctx) await this.acl.assertProductAccess(id, ctx, 'view');
    return this.toView(product);
  }

  async update(id: string, dto: UpdateProductSheetDto, ctx?: AccessContext): Promise<ProductSheetView> {
    const before = await this.load(id);

    // Same authorization as editing the product: edit_products on its Lista.
    if (ctx) await this.acl.assertProductAccess(id, ctx, 'edit_products');
    await this.assertListaEditable(before.listaId);

    const sheet = normalizeSheet(dto);

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
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Lost a race on the unique slug (or a spec group key).
        throw new ConflictException('Ya existe otro producto con ese slug');
      }
      throw error;
    }

    const after = this.toView(await this.load(id));
    await this.audit.log({
      userId: ctx?.userId,
      action: 'update_sheet',
      entity: 'Product',
      entityId: id,
      oldValues: this.auditSnapshot(this.toView(before)),
      newValues: this.auditSnapshot(after),
    });
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

  private toView(p: ProductWithSheet): ProductSheetView {
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
