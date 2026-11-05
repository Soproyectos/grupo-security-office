import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../products/product-library';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { hasGlobalGrant } from '../../common/security/require-grant';
import type { AccessContext } from '../../common/acl/acl.service';

export interface ProductsStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  withoutImage: number;
  withoutPrice: number;
  topCategories: Array<{ name: string; count: number }>;
}

export interface UpdateStats {
  unvalidated: number;
  notUpdated30Days: number;
  pendingPriceRevisions: number;
  lastPriceRevisionAppliedAt: Date | null;
  jobsQueued: number;
  jobsRunning: number;
}

export interface PublicationStats {
  pending: number;
  withIssues: number;
  published: number;
  latestPublished: Array<{ name: string; publishedAt: Date | null }>;
}

/** Only the sections the user is granted are present; no grant means `{}`. */
export interface LibraryStats {
  products?: ProductsStats;
  update?: UpdateStats;
  publication?: PublicationStats;
}

const STALE_DAYS = 30;
const LATEST_PUBLISHED = 5;
const TOP_CATEGORIES = 5;

/**
 * "Mi resumen" Library statistics. Each section is an extra per-tab permission
 * (`libraryStats:*`, which depends on the tab's own access); the server decides,
 * never the frontend. `Product.lifecycleStatus` is the source of truth for states.
 */
@Injectable()
export class LibraryStatsService {
  constructor(
    private readonly grants: AccessAssignmentsService,
    prisma: PrismaService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
  ) {}

  private get db(): PrismaService { return this.library.client as unknown as PrismaService }

  async getLibraryStats(ctx: AccessContext): Promise<LibraryStats> {
    const [products, update, publication] = await Promise.all([
      hasGlobalGrant(this.grants, 'libraryStats:products', ctx),
      hasGlobalGrant(this.grants, 'libraryStats:update', ctx),
      hasGlobalGrant(this.grants, 'libraryStats:publication', ctx),
    ]);
    const [productsStats, updateStats, publicationStats] = await Promise.all([
      products ? this.productsStats() : undefined,
      update ? this.updateStats() : undefined,
      publication ? this.publicationStats() : undefined,
    ]);
    const result: LibraryStats = {};
    if (productsStats) result.products = productsStats;
    if (updateStats) result.update = updateStats;
    if (publicationStats) result.publication = publicationStats;
    return result;
  }

  private async productsStats(): Promise<ProductsStats> {
    const db = this.db;
    const [total, published, draft, archived, withoutImage, withoutPrice, categories] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { lifecycleStatus: 'PUBLISHED' } }),
      db.product.count({ where: { lifecycleStatus: 'DRAFT' } }),
      db.product.count({ where: { lifecycleStatus: 'ARCHIVED' } }),
      db.product.count({ where: { images: { none: {} } } }),
      db.product.count({ where: { prices: { none: {} } } }),
      db.category.findMany({
        take: TOP_CATEGORIES,
        orderBy: { products: { _count: 'desc' } },
        select: { name: true, _count: { select: { products: true } } },
      }),
    ]);
    return {
      total, published, draft, archived, withoutImage, withoutPrice,
      topCategories: categories.map((c) => ({ name: c.name, count: c._count.products })),
    };
  }

  private async updateStats(): Promise<UpdateStats> {
    const db = this.db;
    const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const active = { lifecycleStatus: { not: 'ARCHIVED' } };
    const [unvalidated, notUpdated30Days, pendingPriceRevisions, lastApplied, jobsQueued, jobsRunning] = await Promise.all([
      // A product with no validated revision (or no revision at all) has an unvalidated sheet.
      db.product.count({ where: { ...active, revisions: { none: { validatedAt: { not: null } } } } }),
      db.product.count({ where: { ...active, updatedAt: { lt: staleBefore } } }),
      db.priceImportRevision.count({ where: { status: 'GUARDADA' } }),
      db.priceImportRevision.findFirst({
        where: { status: 'APLICADA', appliedAt: { not: null } },
        orderBy: { appliedAt: 'desc' },
        select: { appliedAt: true },
      }),
      db.catalogJob.count({ where: { state: 'QUEUED' } }),
      db.catalogJob.count({ where: { state: 'RUNNING' } }),
    ]);
    return {
      unvalidated, notUpdated30Days, pendingPriceRevisions,
      lastPriceRevisionAppliedAt: lastApplied?.appliedAt ?? null,
      jobsQueued, jobsRunning,
    };
  }

  /** Same predicates as the publication board (`publication-board.service.ts`) so the figures match its tabs. */
  private async publicationStats(): Promise<PublicationStats> {
    const db = this.db;
    const withIssues = { lifecycleStatus: { not: 'ARCHIVED' }, revisions: { some: { status: 'CON_PROBLEMAS' } } };
    const pending = { lifecycleStatus: 'DRAFT', publicRevisionId: null, revisions: { none: { status: 'CON_PROBLEMAS' } } };
    const published = { lifecycleStatus: 'PUBLISHED', publicRevisionId: { not: null } };
    const [pendingCount, issuesCount, publishedCount, latest] = await Promise.all([
      db.product.count({ where: pending as never }),
      db.product.count({ where: withIssues as never }),
      db.product.count({ where: published as never }),
      db.product.findMany({
        where: { ...published, publishedAt: { not: null } } as never,
        orderBy: { publishedAt: 'desc' },
        take: LATEST_PUBLISHED,
        select: { name: true, catalogName: true, publishedAt: true },
      }),
    ]);
    return {
      pending: pendingCount,
      withIssues: issuesCount,
      published: publishedCount,
      latestPublished: latest.map((p) => ({ name: p.catalogName ?? p.name, publishedAt: p.publishedAt })),
    };
  }
}
