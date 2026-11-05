/**
 * CAT-06 (P4) — bandeja de publicación. Cuatro lecturas sobre el MISMO estado
 * que el scheduler usará para publicar (diseño §6/§7: la bandeja no inventa
 * datos ni re-valida reglas desde el navegador):
 *
 *  - `pendientes` : DRAFT sin oferta publicada y sin informe `CON_PROBLEMAS`
 *    (nunca validados, obsoletos tras editar, o listos aún sin publicar).
 *  - `problemas`  : con revisión de trabajo `CON_PROBLEMAS`.
 *  - `publicados` : PUBLISHED con `publicRevisionId` (la revisión EXACTA que
 *    sirve la tienda — el pin CAT-06).
 *  - `historial`  : eventos de `publication_events` (quién/qué/resultado).
 *
 * Alcance: ninguno por Lista. La concesión global `products:read` (exigida por el
 * controlador) ve todos los productos, con o sin Lista. Búsqueda por sku/nombre/catálogo y página de 50 (el trabajo pesado con
 * filtros completos es job asíncrono de CAT-07).
 */
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../product-library';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';

export type BoardView = 'pendientes' | 'problemas' | 'publicados' | 'historial';
const VIEWS: BoardView[] = ['pendientes', 'problemas', 'publicados', 'historial'];
const PAGE_SIZE = 50

@Injectable()
export class PublicationBoardService {
  constructor(
    prisma: PrismaService,
    private acl: AclService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
  ) {}

  private get prisma() { return this.library.client; }

  async board(view: string, ctx: AccessContext, opts: { search?: string; page?: number } = {}) {
    if (!VIEWS.includes(view as BoardView)) {
      throw new BadRequestException(`Vista de bandeja no reconocida: ${view}`)
    }
    // Defensivo: la sesión y la concesión las exige ya el guard; esto es el candado.
    if (!ctx.userId) throw new ForbiddenException('Se requiere sesión')
    const v = view as BoardView
    const page = Math.max(0, Math.floor(opts.page ?? 0))
    const skip = page * PAGE_SIZE
    const search = opts.search?.trim()
    const searchWhere = search
      ? { OR: [
          { sku: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { catalogName: { contains: search, mode: 'insensitive' as const } },
        ] }
      : {}

    if (v === 'historial') {
      // Eventos de todos los productos (sin alcance por Lista).
      const where = {}
      const [count, rows] = await Promise.all([
        this.prisma.publicationEvent.count({ where }),
        this.prisma.publicationEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: PAGE_SIZE }),
      ])
      return { view: v, page, pageSize: PAGE_SIZE, total: count, items: rows }
    }

    const baseWhere = { ...searchWhere }
    const productSelect = {
      id: true, sku: true, name: true, catalogName: true, lifecycleStatus: true,
      publishAt: true, scheduledRevisionId: true, publicRevisionId: true, publishedAt: true,
      listaId: true, category: { select: { name: true } },
    } as const

    let where: Record<string, unknown>
    if (v === 'publicados') {
      where = { ...baseWhere, lifecycleStatus: 'PUBLISHED', publicRevisionId: { not: null } }
    } else if (v === 'problemas') {
      where = { ...baseWhere, lifecycleStatus: { not: 'ARCHIVED' }, revisions: { some: { status: 'CON_PROBLEMAS' as never } } }
    } else {
      where = { ...baseWhere, lifecycleStatus: 'DRAFT', publicRevisionId: null, revisions: { none: { status: 'CON_PROBLEMAS' as never } } }
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where: where as never }),
      this.prisma.product.findMany({ where: where as never, orderBy: { updatedAt: 'desc' }, skip, take: PAGE_SIZE, select: productSelect }),
    ])

    // Enriquecen desde la revisión de trabajo (versión mayor no PUBLICADA):
    // es la misma que publicar va a pinear, así la bandeja no miente.
    const ids = products.map((p) => p.id)
    const revs = ids.length
      ? await this.prisma.productRevision.findMany({
          where: { productId: { in: ids }, status: { not: 'PUBLICADA' as never } },
          orderBy: [{ productId: 'asc' }, { version: 'desc' }],
          select: { id: true, productId: true, status: true, rulesVersion: true, validatedAt: true, issues: true, version: true },
        })
      : []
    const byProduct = new Map<string, (typeof revs)[number]>()
    for (const r of revs) if (!byProduct.has(r.productId)) byProduct.set(r.productId, r)

    const items = products.map((p) => {
      const rev = byProduct.get(p.id) ?? null
      const issues = Array.isArray(rev?.issues) ? (rev!.issues as Array<{ severity: string; code: string }>) : []
      return {
        ...p,
        name: p.catalogName ?? p.name,
        category: p.category?.name ?? null,
        workingRevision: rev ? {
          id: rev.id, version: rev.version, status: rev.status,
          rulesVersion: rev.rulesVersion, validatedAt: rev.validatedAt,
          errorCount: issues.filter((i) => i.severity === 'error').length,
          warningCount: issues.filter((i) => i.severity === 'warning').length,
        } : null,
      }
    })
    return { view: v, page, pageSize: PAGE_SIZE, total, items }
  }

  /** Historial de un producto. La concesión global `products:read` la exige el controlador; ninguna Lista interviene. */
  async productHistory(productId: string, ctx: AccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Se requiere sesión')
    return this.prisma.publicationEvent.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }
}
