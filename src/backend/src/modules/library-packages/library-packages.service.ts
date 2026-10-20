import {
  BadRequestException, ConflictException, ForbiddenException, GoneException,
  Injectable, NotFoundException, PayloadTooLargeException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessContext } from '../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { concessionAssertAction } from '../../common/security/d5-action';
import { decideCatalogResourceAccess, CatalogResource } from '../../common/security/catalog-resource-access';
import { ROLE } from '../../common/rbac/roles.constants';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_LIBRARY_SECTIONS, ExportSummary, LIBRARY_SECTIONS, LibraryManifest, LibrarySection, ManifestProduct } from './library-package.types';
import { writeStoredZip, ZipEntry, ZIP_LIMITS } from './zip';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_URL = /^\/api\/files\/([0-9a-f-]{36})$/i;
const TERMINAL_READY = ['COMPLETED', 'COMPLETED_WITH_ERRORS'];
const MAX_PRODUCTS = 5000;
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const PRODUCT_INCLUDE = Prisma.validator<Prisma.ProductInclude>()({
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  catalogSpecGroups: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } },
  catalogResources: { orderBy: { position: 'asc' } },
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
});
type Product = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;
interface BinaryFile {
  id: string; mimeType: string; visibility: string; ownerProductId: string | null;
  originalName: string | null; sha256: string | null; detectedKind: string | null; sizeBytes: number; data: Buffer | null;
}

export function parseLibrarySections(value: unknown): LibrarySection[] {
  if (value === undefined) return [...DEFAULT_LIBRARY_SECTIONS];
  if (!Array.isArray(value) || !value.length || value.length > LIBRARY_SECTIONS.length ||
      value.some((item) => !LIBRARY_SECTIONS.includes(item))) {
    throw new BadRequestException({ code: 'export-invalid-sections', message: 'Selecciona apartados válidos de la Biblioteca.' });
  }
  return LIBRARY_SECTIONS.filter((section) => value.includes(section));
}

@Injectable()
export class LibraryPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: AccessAssignmentsService,
    private readonly audit: AuditService,
  ) {}

  /** Aggregate export is idempotent by jobId; worker owns checkpoints and states. */
  async buildForJob(jobId: string, ctx: AccessContext): Promise<ExportSummary> {
    await concessionAssertAction(this.grants, 'products:export', ctx);
    const job = await this.prisma.catalogJob.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== 'EXPORT_BUNDLE' || job.actorId !== ctx.userId) throw this.notFound();
    if (job.cancelRequested || job.state === 'CANCELLED') throw new ConflictException('export-cancelled');
    const existing = await this.prisma.exportBundle.findUnique({ where: { jobId } });
    if (existing) {
      await this.assertManifestAccess(existing.manifestJson as unknown as LibraryManifest, ctx);
      return this.summary(existing.id, existing.sizeBytes, existing.manifestJson as unknown as LibraryManifest, []);
    }
    const scope = job.scope as Record<string, unknown>;
    const sections = parseLibrarySections(scope.sections);
    const units = await this.prisma.catalogJobUnit.findMany({ where: { jobId }, orderBy: { unitId: 'asc' }, take: MAX_PRODUCTS + 1 });
    if (!units.length) throw new BadRequestException('export-scope-empty');
    if (units.length > MAX_PRODUCTS) throw new PayloadTooLargeException('export-product-limit');

    const manifest: LibraryManifest = {
      paquete: 'biblioteca-v1', schemaVersion: 1, generadoEn: new Date().toISOString(),
      actorId: ctx.userId, origen: 'biblioteca-editable', secciones: sections,
      productos: [], faltantes: [], restringidos: [],
    };
    const entries: ZipEntry[] = [];
    const omittedIds: string[] = [];
    // Bound while accumulating, rather than discovering the size after all data is in memory.
    let bytesSoFar = 22;
    const append = (path: string, data: Buffer, product?: ManifestProduct, section?: LibrarySection) => {
      if (data.length > ZIP_LIMITS.entryBytes || entries.length >= ZIP_LIMITS.entries - 1 ||
          bytesSoFar + data.length + 76 + 2 * path.length > ZIP_LIMITS.totalBytes) {
        throw new PayloadTooLargeException({ code: 'export-size-limit', message: 'La selección supera el tamaño del paquete. Exporta una selección menor.' });
      }
      bytesSoFar += data.length + 76 + 2 * path.length;
      entries.push({ path, data });
      if (product && section) product.entradas.push({ ruta: path, bytes: data.length, sha256: sha256(data), seccion: section });
    };

    for (const unit of units) {
      if (!UUID.test(unit.unitId)) throw new BadRequestException('export-invalid-product-id');
      const meta = await this.prisma.product.findUnique({ where: { id: unit.unitId }, select: { id: true, listaId: true } });
      if (!meta || !(await this.allowed('products:export', meta, ctx))) {
        omittedIds.push(unit.unitId);
        continue;
      }
      const product = await this.prisma.product.findUnique({ where: { id: unit.unitId }, include: PRODUCT_INCLUDE });
      if (!product || !(await this.allowed('products:export', product, ctx))) {
        omittedIds.push(unit.unitId);
        continue;
      }
      const member: ManifestProduct = {
        id: product.id, sku: product.sku, slug: product.catalogSlug, listaId: product.listaId,
        sheetVersion: product.sheetVersion, entradas: [], permisosRequeridos: ['products:export'],
      };
      manifest.productos.push(member);
      const base = `biblioteca/${product.id}`;
      const json = (name: string, value: unknown, section: LibrarySection) => append(`${base}/${name}`, Buffer.from(JSON.stringify(value, null, 2)), member, section);
      if (sections.includes('ficha')) json('ficha.json', this.sheet(product), 'ficha');
      if (sections.includes('specs')) {
        json('specs.json', product.catalogSpecGroups.map((group) => ({
          key: group.key, title: group.title, items: group.items.map((item) => ({ label: item.label, value: item.value })),
        })), 'specs');
      }
      if (sections.includes('medios')) {
        const images: unknown[] = [];
        for (const [index, image] of product.images.entries()) {
          const bundlePath = await this.appendMedia(product.id, image.url, `${base}/medios/imagen-${index + 1}`, 'medios', member, manifest, append);
          images.push({ url: image.url, alt: image.alt, isPrimary: image.isPrimary, type: image.type, sortOrder: image.sortOrder, bundlePath });
        }
        if (product.catalogImageUrl && !product.images.some((image) => image.url === product.catalogImageUrl)) {
          const bundlePath = await this.appendMedia(product.id, product.catalogImageUrl, `${base}/medios/portada`, 'medios', member, manifest, append);
          images.push({ url: product.catalogImageUrl, alt: product.catalogImageAlt, isPrimary: product.images.length === 0, type: 'IMAGE', sortOrder: -1, bundlePath, catalogCover: true });
        }
        json('medios.json', images, 'medios');
      }
      if (sections.includes('recursos')) {
        const resources: unknown[] = [];
        for (const [index, resource] of product.catalogResources.entries()) {
          const bundlePath = await this.appendMedia(product.id, resource.url, `${base}/recursos/recurso-${index + 1}`, 'recursos', member, manifest, append);
          if (bundlePath && resource.requiresLicense) manifest.restringidos.push({ ruta: bundlePath, motivo: 'requires-license' });
          resources.push({ kind: resource.kind, title: resource.title, language: resource.language, url: resource.url,
            fileName: resource.fileName, version: resource.version, region: resource.region, requiresLicense: resource.requiresLicense, bundlePath });
        }
        json('recursos.json', resources, 'recursos');
      }
      if (sections.includes('notas')) {
        if (await this.allowed('products:notes', product, ctx)) {
          member.permisosRequeridos.push('products:notes');
          json('notas-privadas.json', { internalNotes: product.catalogInternalNotes, restricted: true }, 'notas');
          manifest.restringidos.push({ ruta: `${base}/notas-privadas.json`, motivo: 'notas' });
        } else manifest.faltantes.push({ producto: product.id, ruta: `${base}/notas-privadas.json`, motivo: 'section-not-authorized' });
      }
      if (sections.includes('precios')) {
        if (await this.allowed('prices:read', product, ctx)) {
          member.permisosRequeridos.push('prices:read');
          const prices = await this.prisma.price.findMany({ where: { productId: product.id }, include: { priceList: true }, orderBy: { priceListId: 'asc' } });
          json('precios.json', prices.map((price) => ({
            priceListId: price.priceListId, code: price.priceList.code, name: price.priceList.name,
            value: price.value.toString(), currency: price.currency, validFrom: price.validFrom, validUntil: price.validUntil,
          })), 'precios');
        } else manifest.faltantes.push({ producto: product.id, ruta: `${base}/precios.json`, motivo: 'section-not-authorized' });
      }
    }
    if (!manifest.productos.length) throw new ForbiddenException('export-scope-empty');
    if (manifest.restringidos.some((item) => item.motivo === 'requires-license')) {
      append('AVISO-LICENCIA.txt', Buffer.from('Los recursos marcados requiresLicense conservan sus restricciones de uso. Descargar este paquete no transfiere licencias ni derechos.\n'));
    }
    append('MANIFIESTO.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    const bytes = writeStoredZip(entries);
    // Check permissions again after potentially slow media collection, before any persistence.
    await this.assertManifestAccess(manifest, ctx);
    const flag = await this.prisma.catalogJob.findUnique({ where: { id: jobId }, select: { cancelRequested: true, state: true } });
    if (!flag || flag.cancelRequested || flag.state === 'CANCELLED') throw new ConflictException('export-cancelled');
    const bundle = await this.prisma.exportBundle.upsert({
      where: { jobId }, update: {},
      create: { jobId, actorId: ctx.userId, bundleBytes: bytes, sizeBytes: bytes.length, sha256: sha256(bytes), manifestJson: manifest as unknown as Prisma.InputJsonValue, expiresAt: null },
    });
    await this.audit.log({ userId: ctx.userId, action: 'library-export-built', entity: 'ExportBundle', entityId: bundle.id,
      newValues: { jobId, exported: manifest.productos.length, entries: entries.length, sizeBytes: bytes.length, sha256: bundle.sha256, missing: manifest.faltantes.length } });
    return this.summary(bundle.id, bundle.sizeBytes, bundle.manifestJson as unknown as LibraryManifest, omittedIds);
  }

  private sheet(product: Product): Record<string, unknown> {
    // Explicit whitelist: no spread of Product/revision JSON may expose internal notes or prices.
    return {
      sku: product.sku, name: product.name, description: product.description,
      categoryId: product.categoryId, brandId: product.brandId, category: product.category, brand: product.brand,
      technicalSpecs: product.technicalSpecs, extraAttributes: product.extraAttributes,
      catalogName: product.catalogName, catalogSlug: product.catalogSlug, catalogStatus: product.catalogStatus,
      catalogBrand: product.catalogBrand, catalogModel: product.catalogModel,
      catalogBadges: product.catalogBadges, catalogHighlights: product.catalogHighlights,
      catalogFeatures: product.catalogFeatures, catalogAvailableModels: product.catalogAvailableModels,
      catalogBreadcrumb: product.catalogBreadcrumb, catalogSpecsDisclaimer: product.catalogSpecsDisclaimer,
      catalogFirmwareNote: product.catalogFirmwareNote, catalogManufacturerRefs: product.catalogManufacturerRefs,
      catalogImageUrl: product.catalogImageUrl, catalogImageAlt: product.catalogImageAlt,
    };
  }

  private async appendMedia(
    productId: string, url: string, path: string, section: LibrarySection, member: ManifestProduct,
    manifest: LibraryManifest, append: (path: string, data: Buffer, product?: ManifestProduct, section?: LibrarySection) => void,
  ): Promise<string | null> {
    const missing = (reason: string) => { manifest.faltantes.push({ producto: productId, ruta: path, motivo: reason }); return null; };
    const id = FILE_URL.exec(url)?.[1];
    if (!id || !UUID.test(id)) return missing('external-or-unsupported-url'); // Never fetch arbitrary URLs.
    // Bound in SQL BEFORE returning bytea. Legacy files may not have sizeBytes metadata.
    const rows = await this.prisma.$queryRaw<BinaryFile[]>`
      SELECT id, "mimeType", visibility, "ownerProductId", "originalName", sha256, "detectedKind",
             octet_length(data)::int AS "sizeBytes",
             CASE WHEN octet_length(data) <= ${ZIP_LIMITS.entryBytes} THEN data ELSE NULL END AS data
      FROM uploaded_files WHERE id = ${id}
    `;
    const file = rows[0];
    if (!file) return missing('file-missing');
    if (file.visibility !== 'PUBLIC' && (file.visibility !== 'PRIVATE' || file.ownerProductId !== productId)) return missing('file-not-authorized');
    if (file.sizeBytes > ZIP_LIMITS.entryBytes || !file.data) return missing('file-size-limit');
    const bytes = Buffer.from(file.data);
    if (!bytes.length || bytes.length !== file.sizeBytes || (file.sha256 && sha256(bytes) !== file.sha256)) return missing('file-integrity-failed');
    const extension = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'application/pdf': '.pdf', 'application/zip': '.zip' } as Record<string, string>)[file.mimeType] ?? '.bin';
    const bundlePath = `${path}-${file.id}${extension}`;
    append(bundlePath, bytes, member, section);
    return bundlePath;
  }

  private resource(product: { id: string; listaId: string | null }): CatalogResource {
    return { id: product.id, kind: 'product', productId: product.id, listId: product.listaId ?? undefined };
  }

  private async allowed(actionId: string, product: { id: string; listaId: string | null }, ctx: AccessContext): Promise<boolean> {
    return (await decideCatalogResourceAccess(this.grants, actionId, ctx, this.resource(product))).allowed;
  }

  private async assertManifestAccess(manifest: LibraryManifest, ctx: AccessContext): Promise<void> {
    await concessionAssertAction(this.grants, 'products:export', ctx);
    if (manifest?.paquete !== 'biblioteca-v1' || !Array.isArray(manifest.productos) || !manifest.productos.length || manifest.productos.length > MAX_PRODUCTS) throw this.notFound();
    for (const member of manifest.productos) {
      const product = await this.prisma.product.findUnique({ where: { id: member.id }, select: { id: true, listaId: true } });
      if (!product) throw this.notFound();
      for (const action of new Set(['products:export', ...member.permisosRequeridos])) {
        if (!(await this.allowed(action, product, ctx))) throw this.notFound();
      }
    }
  }

  private summary(bundleId: string, bytesTotal: number, manifest: LibraryManifest, omittedIds: string[]): ExportSummary {
    return { bundleId, bytesTotal, entries: manifest.productos.reduce((count, product) => count + product.entradas.length, 0) + 1 +
      (manifest.restringidos.some((item) => item.motivo === 'requires-license') ? 1 : 0),
    missingCount: manifest.faltantes.length, exported: manifest.productos.length, omittedIds };
  }

  private notFound(): NotFoundException { return new NotFoundException('Paquete no encontrado'); }

  /** Metadata fetch deliberately excludes large bundleBytes until access checks pass. */
  private async accessibleBundle(id: string, ctx: AccessContext) {
    if (!ctx?.userId?.trim()) throw new ForbiddenException('export-not-authorized');
    await concessionAssertAction(this.grants, 'products:export', ctx);
    const bundle = await this.prisma.exportBundle.findUnique({ where: { id },
      select: { id: true, jobId: true, actorId: true, sizeBytes: true, sha256: true, manifestJson: true, expiresAt: true, createdAt: true, job: { select: { state: true, progressDone: true, progressTotal: true } } } });
    if (!bundle || (bundle.actorId !== ctx.userId && !ctx.roles?.includes(ROLE.SUPER_ADMIN))) throw this.notFound();
    await this.assertManifestAccess(bundle.manifestJson as unknown as LibraryManifest, ctx);
    if (bundle.expiresAt && bundle.expiresAt.getTime() <= Date.now()) throw new GoneException({ code: 'bundle-expired', message: 'Este paquete venció. Genera uno nuevo.' });
    if (!TERMINAL_READY.includes(bundle.job.state)) throw new ConflictException({ code: 'bundle-not-ready', message: 'El trabajo todavía no terminó.' });
    return bundle;
  }

  async get(id: string, ctx: AccessContext) {
    const bundle = await this.accessibleBundle(id, ctx);
    return { id: bundle.id, jobId: bundle.jobId, state: bundle.job.state, progressDone: bundle.job.progressDone,
      progressTotal: bundle.job.progressTotal, sizeBytes: bundle.sizeBytes, sha256: bundle.sha256,
      expiresAt: bundle.expiresAt, createdAt: bundle.createdAt };
  }

  async download(id: string, ctx: AccessContext): Promise<{ data: Buffer; filename: string; sha256: string }> {
    const bundle = await this.accessibleBundle(id, ctx);
    const stored = await this.prisma.exportBundle.findUnique({ where: { id }, select: { bundleBytes: true } });
    if (!stored) throw this.notFound();
    const bytes = Buffer.from(stored.bundleBytes);
    if (bytes.length !== bundle.sizeBytes || sha256(bytes) !== bundle.sha256) throw new ConflictException('bundle-integrity-failed');
    await this.audit.log({ userId: ctx.userId, action: 'library-export-download', entity: 'ExportBundle', entityId: id,
      newValues: { jobId: bundle.jobId, sizeBytes: bytes.length, sha256: bundle.sha256 } });
    return { data: bytes, filename: `biblioteca-${bundle.id}.zip`, sha256: bundle.sha256 };
  }
}
