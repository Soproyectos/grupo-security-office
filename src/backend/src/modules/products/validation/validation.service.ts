/**
 * CAT-05 `backend-api` — servicio de validación.
 *
 * Ensambla el `ProductValidationInput` desde el estado real (producto, categoría,
 * marca, imágenes, recursos, archivos del almacén, Lista/precios, stock), ejecuta
 * el motor puro (`validation-rules`) y PERSISTE el informe en la REVISIÓN de
 * trabajo (D4): `validatedAt`/`rulesVersion`/`issues` + estado de revisión.
 * Jamás escribe sobre una revisión PUBLICADA (invariantes CAT-02).
 *
 * Autorización (§3.4): acción `products:validate` con transición D5 (helper
 * `d5AssertAction`) + ACL `view` sobre el producto. El batch respeta el alcance
 * por producto: lo no autorizado se reporta como `omitted` sin revelar datos.
 */
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Prisma as LibraryPrisma } from '../../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { directLegacyProductLibrary } from '../product-library';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { assertGlobalGrant } from '../../../common/security/require-grant';
import { ProductRevisionsService } from '../product-revisions.service';
import { RULES_VERSION, ProductValidationInput, runValidation, isStaleReport, ValidationIssue, ValidationResult } from './validation-rules'
import { isPriceCurrentlyValid, priceValidityWhere } from './price-validity'

/** Mismo criterio que el motor (`validation-rules`): cualquier id bajo /api/files/. */
const FILE_URL_RE = /^\/api\/files\/([^/?#]+)$/

export interface ValidationReport {
  productId: string
  revisionId: string
  status: 'CON_PROBLEMAS' | 'LISTA_PARA_PUBLICAR'
  issues: ValidationIssue[]
  rulesVersion: string
  at: Date
}

export interface BatchResultItem {
  productId: string
  outcome: 'LISTA_PARA_PUBLICAR' | 'CON_PROBLEMAS' | 'omitted' | 'failed'
  errorCount?: number
  warningCount?: number
  reason?: string
}

@Injectable()
export class ProductValidationService {
  constructor(
    private readonly operational: PrismaService,
    private acl: AclService,
    /** D5: con concesiones vigentes exige `products:validate`; sin ellas, la capa rol+ACL. */
    @Optional() private readonly grants?: AccessAssignmentsService,
    /** Si no hay borrador, la validación crea la revisión de trabajo con el snapshot vivo. */
    @Optional() private readonly revisions?: ProductRevisionsService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(operational),
    @Inject(LibraryAuditService) private readonly audit: LibraryAuditService = new LibraryAuditService(library),
  ) {}

  private get prisma() { return this.library.client; }

  /** POST /products/:id/validation — recalcula y persiste sobre la revisión de trabajo. */
  async validateOne(productId: string, ctx: AccessContext): Promise<ValidationReport> {
    await assertGlobalGrant(this.grants, 'products:validate', ctx)
    await this.assertView(productId, ctx)
    // CAT-06: el cálculo/persistencia vive en runFresh (lo reutiliza publicar).
    return (await this.runFresh(productId, ctx)).report
  }

  /**
   * CAT-06 (P2, diseño §6 «antes de publicar el servidor comprueba de nuevo»):
   * ejecuta el motor AHORA sobre el estado vivo (nunca confía en un informe
   * guardado) y persiste el resultado en la revisión de trabajo. Sin
   * autorización — el llamador ya validó sesión/acciones (endpoint) o es el
   * scheduler interno.
   */
  async runFresh(productId: string, ctx?: AccessContext): Promise<{ report: ValidationReport; result: ValidationResult }> {
    return this.library.writeTransaction(async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM products WHERE id=${productId} FOR UPDATE`;
      const input = await this.assemble(productId, tx)
      const result = runValidation(input)

      const working = await this.workingRevision(productId, input.revisionId, tx)
      const report: ValidationReport = {
        productId,
        revisionId: working.id,
        status: result.status,
        issues: result.issues,
        rulesVersion: result.rulesVersion,
        at: new Date(),
      }
      await this.persist(working.id, report, tx)
      await this.audit.append(tx, { actor: { id: ctx?.userId }, action: 'PRODUCT_VALIDATED', entityType: 'ProductRevision', entityId: working.id, summary: { productId, status: report.status, rulesVersion: report.rulesVersion, issueCount: report.issues.length } });
      return { report, result }
    });
  }

  /** GET /products/:id/validation — último informe + bandera de obsolescencia (V2). */
  async reportOf(productId: string, ctx: AccessContext): Promise<(ValidationReport & { stale: boolean }) | null> {
    await assertGlobalGrant(this.grants, 'products:validate', ctx)
    await this.assertView(productId, ctx)

    const rev = await this.prisma.productRevision.findFirst({
      where: { productId, validatedAt: { not: null } },
      orderBy: [{ validatedAt: 'desc' }],
      select: { id: true, status: true, rulesVersion: true, issues: true, validatedAt: true },
    })
    if (!rev || !rev.validatedAt || !rev.rulesVersion || !Array.isArray(rev.issues)) return null

    const working = await this.prisma.productRevision.findFirst({
      where: { productId, status: { not: 'PUBLICADA' as never } },
      orderBy: { version: 'desc' },
      select: { id: true },
    })
    const stale = isStaleReport({ rulesVersion: rev.rulesVersion, revisionId: rev.id }, { rulesVersion: RULES_VERSION, currentRevisionId: working?.id ?? null })
    return {
      productId,
      revisionId: rev.id,
      status: rev.status === 'CON_PROBLEMAS' ? 'CON_PROBLEMAS' : 'LISTA_PARA_PUBLICAR',
      issues: rev.issues as unknown as ValidationIssue[],
      rulesVersion: rev.rulesVersion,
      at: rev.validatedAt,
      stale,
    }
  }

  /** POST /products/validation/batch — selección (tope 200); alcance respetado por producto. */
  async validateBatch(productIds: string[], ctx: AccessContext): Promise<{
    examined: number
    valid: number
    withErrors: number
    omitted: number
    failed: number
    results: BatchResultItem[]
  }> {
    await assertGlobalGrant(this.grants, 'products:validate', ctx)
    const ids = [...new Set((productIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))]
    if (ids.length === 0) throw new BadRequestException('La selección está vacía.')
    if (ids.length > 200) throw new BadRequestException('La validación por selección admite hasta 200 productos (el trabajo con filtros completos es CAT-07).')

    const results: BatchResultItem[] = []
    for (const productId of ids) {
      try {
        const ok = await this.canView(productId, ctx)
        if (!ok) {
          results.push({ productId, outcome: 'omitted', reason: 'Fuera de tu alcance (no se revelan datos).' })
          continue
        }
        const { result } = await this.runFresh(productId, ctx)
        results.push({
          productId,
          outcome: result.status,
          errorCount: result.issues.filter((i) => i.severity === 'error').length,
          warningCount: result.issues.filter((i) => i.severity === 'warning').length,
        })
      } catch (error) {
        // «Un fallo de procesamiento no se cuenta como producto válido.»
        results.push({ productId, outcome: 'failed', reason: error instanceof Error ? error.message : 'fallo desconocido' })
      }
    }
    return {
      examined: results.length,
      valid: results.filter((r) => r.outcome === 'LISTA_PARA_PUBLICAR').length,
      withErrors: results.filter((r) => r.outcome === 'CON_PROBLEMAS').length,
      omitted: results.filter((r) => r.outcome === 'omitted').length,
      failed: results.filter((r) => r.outcome === 'failed').length,
      results,
    }
  }

  // ─── internos ─────────────────────────────────────────────────────────────

  private async assertView(productId: string, ctx: AccessContext): Promise<void> {
    await assertGlobalGrant(this.grants, 'products:validate', ctx)
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
    if (!product) throw new NotFoundException('Producto no encontrado')
  }

  private async canView(productId: string, ctx: AccessContext): Promise<boolean> {
    try {
      await this.assertView(productId, ctx)
      return true
    } catch {
      return false
    }
  }

  /** Revisión de trabajo = la más nueva no PUBLICADA; si no hay, se crea con el snapshot vivo. */
  private async workingRevision(productId: string, fallbackId: string, tx: LibraryPrisma.TransactionClient): Promise<{ id: string }> {
    const draft = await tx.productRevision.findFirst({
      where: { productId, status: { not: 'PUBLICADA' as never } },
      orderBy: { version: 'desc' },
      select: { id: true },
    })
    if (draft) return draft
    if (this.revisions) {
      const created = await this.revisions.markPendingFromLive(productId, tx)
      if (created) return { id: created.id }
    }
    // Sin mecanismo de revisiones (specs de 2 args): se ancla al id ensamblado.
    return { id: fallbackId }
  }

  private async persist(revisionId: string, report: ValidationReport, tx: LibraryPrisma.TransactionClient): Promise<void> {
    const rev = await tx.productRevision.findUnique({ where: { id: revisionId }, select: { status: true } })
    if (rev?.status === ('PUBLICADA' as never)) return // jamás se escribe sobre la publicada
    await tx.productRevision.update({
      where: { id: revisionId },
      data: {
        validatedAt: report.at,
        rulesVersion: report.rulesVersion,
        issues: report.issues as unknown as Prisma.InputJsonValue,
        status: report.status as never,
      },
    })
  }

  /** Ensambla el estado real del producto para el motor puro. */
  private async assemble(productId: string, tx: LibraryPrisma.TransactionClient): Promise<ProductValidationInput> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        catalogName: true,
        catalogBrand: true,
        brandId: true,
        brand: { select: { name: true } },
        catalogPublished: true,
        lifecycleStatus: true,
        listaId: true,
        category: { select: { isActive: true, slug: true } },
        images: { select: { url: true, isPrimary: true }, orderBy: { sortOrder: 'asc' } },
        catalogResources: { select: { kind: true, url: true, requiresLicense: true }, orderBy: { position: 'asc' } },
      },
    })
    if (!product) throw new NotFoundException('Producto no encontrado')

    // Stock remains operational; no include or FK across databases.
    const stock = await this.operational.stock.findUnique({ where: { productId }, select: { availableQty: true } })
    const urls = [...product.images.map((i) => i.url), ...product.catalogResources.map((r) => r.url)]
    const fileIds = [...new Set(urls.map((u) => FILE_URL_RE.exec(u)?.[1]).filter((x): x is string => !!x))]
    const files: ProductValidationInput['files'] = {}
    if (fileIds.length > 0) {
      const rows = await tx.uploadedFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, detectedKind: true } })
      for (const id of fileIds) {
        const row = rows.find((r) => r.id === id)
        files[id] = { exists: !!row, detectedKind: row?.detectedKind ?? null }
      }
    }

    // El precio pertenece al producto; `listaId` no limita la oferta vigente.
    const now = new Date()
    const ps = await tx.price.findMany({
      where: { productId, ...priceValidityWhere(now) },
      select: { value: true, validFrom: true, validUntil: true },
    })
    const prices: ProductValidationInput['prices'] = ps.map((p) => {
      const num = Number(p.value)
      return {
        valueOk: Number.isFinite(num) && num > 0,
        expired: !isPriceCurrentlyValid(p.validFrom, p.validUntil, now),
      }
    })

    return {
      productId: product.id,
      revisionId: product.id, // fallback si no hay mecanismo de revisiones (specs)
      name: product.name,
      catalogName: product.catalogName,
      brandId: product.brandId,
      brandName: product.brand?.name ?? null,
      catalogBrand: product.catalogBrand,
      categoryActive: product.category?.isActive ?? false,
      categorySlug: product.category?.slug ?? null,
      images: product.images,
      resources: product.catalogResources,
      files,
      lista: null,
      prices,
      stockZero: !!stock && stock.availableQty <= 0,
    }
  }
}
