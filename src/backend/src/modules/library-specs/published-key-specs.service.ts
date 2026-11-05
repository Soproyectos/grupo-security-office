import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { effectiveIdentity, loadActiveRevisionContents } from '../products/public-revision-lens'
import { buildPublishedKeySpecProjection, type KeySpecProjection } from '../products/key-specs/key-spec-projection'
import type { ProductKeySpecValue } from '../products/key-specs/key-spec.types'
import { DEFINITION_INCLUDE, toDomainDefinition, toDomainTemplate, toDomainValue } from './library-specs.mapper'
import {
  filterValuesOf,
  filterableEntries,
  overlayDraftValues,
  planKeySpecPublication,
  projectionMatchesFilters,
  toPublicKeySpecItems,
  type KeySpecFilter,
  type PublicKeySpecItem,
} from './published-key-specs.rules'

export interface KeySpecFacetView {
  specKey: string
  label: string
  dataType: string
  unit: string | null
  values: { value: string; label: string; count: number }[]
}

export interface KeySpecFacetsView {
  subcategoryId: string
  products: number
  facets: KeySpecFacetView[]
}

/**
 * Read side of the published key specs: the public sheet, the admin draft preview
 * and the store filters all go through `projectMany`, so they read one source
 * (PUBLISHED values of APPROVED template rows) and one projection.
 */
@Injectable()
export class PublishedKeySpecsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Projection per product. `published` reads PUBLISHED only; `draft` lets WORKING values win. */
  async projectMany(productIds: string[], mode: 'published' | 'draft' = 'published'): Promise<Map<string, KeySpecProjection>> {
    const out = new Map<string, KeySpecProjection>()
    if (productIds.length === 0) return out
    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, subcategoryId: true, publicRevisionId: true },
    })
    // Published-isolation: the PUBLISHED view classifies by the subcategory frozen in the published
    // revision (live column when the revision lacks it); the draft view uses the live one.
    const contents = mode === 'published' ? await loadActiveRevisionContents(this.prisma as never, rows.map((p) => p.publicRevisionId)) : new Map()
    const products = rows.map((p) => ({
      id: p.id,
      subcategoryId: mode === 'published' ? effectiveIdentity(p, contents, 'subcategoryId', p.subcategoryId) : p.subcategoryId,
    }))
    const subcategoryIds = [...new Set(products.map((p) => p.subcategoryId).filter((s): s is string => s !== null))]
    const [defRows, templateRows, valueRows] = await Promise.all([
      this.prisma.specDefinition.findMany({ include: DEFINITION_INCLUDE }),
      subcategoryIds.length ? this.prisma.subcategorySpec.findMany({ where: { subcategoryId: { in: subcategoryIds } } }) : Promise.resolve([]),
      this.prisma.productSpecValue.findMany({
        where: { productId: { in: products.map((p) => p.id) }, ...(mode === 'published' ? { stage: 'PUBLISHED' as const } : {}) },
        include: { options: true },
      }),
    ])
    const definitions = defRows.map(toDomainDefinition)
    const templates = templateRows.map(toDomainTemplate)
    const valuesByProduct = new Map<string, ProductKeySpecValue[]>()
    for (const row of valueRows) {
      const list = valuesByProduct.get(row.productId) ?? []
      list.push(toDomainValue(row))
      valuesByProduct.set(row.productId, list)
    }
    for (const p of products) {
      const values = valuesByProduct.get(p.id) ?? []
      out.set(
        p.id,
        buildPublishedKeySpecProjection({
          subcategoryId: p.subcategoryId,
          definitions,
          templates: templates.filter((t) => t.subcategoryId === p.subcategoryId),
          values: mode === 'draft' ? overlayDraftValues(values) : values,
        }),
      )
    }
    return out
  }

  /** Sheet items of the PUBLISHED stage (empty when none). */
  async publishedItems(productId: string): Promise<PublicKeySpecItem[]> {
    const projection = (await this.projectMany([productId])).get(productId)
    return projection ? toPublicKeySpecItems(projection) : []
  }

  /** Sheet items of the draft view and whether publishing would change the published set. Never writes. */
  async draftPreview(productId: string): Promise<{ items: PublicKeySpecItem[]; unpublishedChanges: boolean }> {
    const [projection, rows] = await Promise.all([
      this.projectMany([productId], 'draft').then((m) => m.get(productId)),
      this.prisma.productSpecValue.findMany({ where: { productId }, include: { options: true } }),
    ])
    const values = rows.map(toDomainValue)
    const plan = planKeySpecPublication(
      values.filter((v) => v.stage === 'WORKING'),
      values.filter((v) => v.stage === 'PUBLISHED'),
    )
    return {
      items: projection ? toPublicKeySpecItems(projection) : [],
      unpublishedChanges: plan.upsert.length > 0 || plan.remove.length > 0,
    }
  }

  /**
   * Ids of products whose PUBLISHED key specs satisfy every filter. Visibility is NOT decided
   * here: the caller intersects the result with the public catalog rule.
   */
  async matchingProductIds(filters: KeySpecFilter[]): Promise<string[]> {
    if (filters.length === 0) return []
    const keys = [...new Set(filters.map((f) => f.specKey))]
    const defs = await this.prisma.specDefinition.findMany({ where: { key: { in: keys } }, select: { id: true } })
    if (defs.length !== keys.length) return []
    // Cheap pre-filter: products holding a published, known answer for every asked datum.
    let candidates: string[] | null = null
    for (const def of defs) {
      const rows: { productId: string }[] = await this.prisma.productSpecValue.findMany({
        where: {
          specDefinitionId: def.id,
          stage: 'PUBLISHED',
          state: 'KNOWN',
          ...(candidates ? { productId: { in: candidates } } : {}),
        },
        select: { productId: true },
      })
      candidates = rows.map((r) => r.productId)
      if (candidates.length === 0) return []
    }
    const projections = await this.projectMany(candidates ?? [])
    return [...projections].filter(([, p]) => projectionMatchesFilters(p, filters)).map(([id]) => id)
  }

  /**
   * Facets of a subcategory over the products that satisfy the given public visibility rule
   * (passed in, never redefined here), from PUBLISHED values only.
   */
  async facets(subcategoryId: string, visibility: Prisma.ProductWhereInput): Promise<KeySpecFacetsView> {
    // Published-isolation: membership in the subcategory is the PUBLISHED one (snapshot key when
    // present, live column otherwise); visibility is still the rule passed in.
    const inSubcategory = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id FROM products p
      LEFT JOIN product_revisions r ON r.id = p."publicRevisionId" AND r.status = 'PUBLICADA'
      WHERE (CASE WHEN r.content IS NOT NULL AND jsonb_exists(r.content, 'subcategoryId')
        THEN r.content->>'subcategoryId' ELSE p."subcategoryId" END) = ${subcategoryId}`)
    const visible = inSubcategory.length
      ? await this.prisma.product.findMany({ where: { id: { in: inSubcategory.map((p) => p.id) }, AND: [visibility] }, select: { id: true } })
      : []
    const visibleProductIds = visible.map((p) => p.id)
    const projections = await this.projectMany(visibleProductIds)
    const bySpec = new Map<string, { facet: KeySpecFacetView; order: number; values: Map<string, { label: string; count: number }> }>()
    for (const projection of projections.values()) {
      for (const entry of filterableEntries(projection)) {
        const slot = bySpec.get(entry.specKey) ?? {
          facet: { specKey: entry.specKey, label: entry.label, dataType: entry.dataType, unit: entry.unit, values: [] },
          order: entry.sortOrder,
          values: new Map<string, { label: string; count: number }>(),
        }
        for (const v of filterValuesOf(entry)) {
          const seen = slot.values.get(v.value)
          slot.values.set(v.value, { label: v.label, count: (seen?.count ?? 0) + 1 })
        }
        bySpec.set(entry.specKey, slot)
      }
    }
    const facets = [...bySpec.values()]
      .filter((s) => s.values.size > 0)
      .sort((a, b) => a.order - b.order || a.facet.label.localeCompare(b.facet.label, 'es'))
      .map((s) => ({
        ...s.facet,
        values: [...s.values].map(([value, v]) => ({ value, ...v })).sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true })),
      }))
    return { subcategoryId, products: visibleProductIds.length, facets }
  }
}
