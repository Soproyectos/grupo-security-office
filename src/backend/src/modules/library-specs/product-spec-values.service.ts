import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { missingRequiredKeySpecs } from '../products/key-specs/key-spec-readiness'
import { buildPublishedKeySpecProjection } from '../products/key-specs/key-spec-projection'
import {
  validateKeySpecHolder,
  validateKeySpecValue,
  type KeySpecValueInput,
  type NormalizedKeySpecValue,
} from '../products/key-specs/key-spec-value.validation'
import { validateProductSource } from '../products/key-specs/product-source'
import type {
  KeySpecStage,
  KeySpecValueState,
  ProductKeySpecValue,
  SpecDefinition,
  SubcategorySpec,
} from '../products/key-specs/key-spec.types'
import { overlayDraftValues, planKeySpecPublication } from './published-key-specs.rules'
import type { ProductSpecWriteEntry, ProductSpecWriteResult, ProductSpecWriteSource } from './dto/library-specs.dto'
import {
  DEFINITION_INCLUDE,
  toDomainDefinition,
  toDomainTemplate,
  toDomainValue,
  type ValueRow,
} from './library-specs.mapper'
import {
  MAX_ABS_NUMBER,
  buildSubcategoryChangePreview,
  isBlankInput,
  sameAnswer,
  notFound,
  roundToScale,
  toNormalized,
  valueState,
  badRequest,
  conflict,
  type SubcategoryChangePreview,
  type ValueState,
} from './library-specs.rules'

const VALUE_INCLUDE = { options: true } satisfies Prisma.ProductSpecValueInclude

export interface StageValueView {
  /**
   * Derived reading: unknown / zero / false / set / not_applicable. NOTE: `unknown` is
   * ambiguous for clients (stored UNKNOWN); use `storedState` to tell answers apart.
   */
  state: ValueState
  /** What is stored: KNOWN, NOT_APPLICABLE or UNKNOWN (an explicit answer, unlike "no row"). */
  storedState: KeySpecValueState
  valueText: string | null
  valueNumber: number | null
  valueBoolean: boolean | null
  optionKeys: string[]
  updatedAt: Date
  updatedBy: string | null
}

export interface ProductSpecItemView {
  specKey: string
  label: string
  dataType: SpecDefinition['dataType']
  unit: string | null
  options: { key: string; label: string; isActive: boolean }[]
  template: Pick<SubcategorySpec, 'status' | 'isRequired' | 'isFilterable' | 'sortOrder'> | null
  /** Has a stored value but its datum is not (or no longer) in the subcategory template: needs review. */
  outsideTemplate: boolean
  /**
   * Derived state of what the editor sees (working, else published). It is `unknown` BOTH when
   * nothing is stored and when UNKNOWN is stored explicitly: clients must read `storedState`
   * (null = no row, 'UNKNOWN' = explicit answer) to tell them apart.
   */
  state: ValueState
  /** Stored state of what the editor sees; null when nothing is stored. */
  storedState: KeySpecValueState | null
  working: StageValueView | null
  published: StageValueView | null
  /** The working value differs from the published one (or exists without a published one). */
  pendingChange: boolean
}

export interface ProductSpecValuesView {
  productId: string
  subcategoryId: string | null
  items: ProductSpecItemView[]
  outsideTemplateCount: number
  sources: { sourceFile: string; sourceSheet: string; sourceRow: number; cutoffDate: string; originalReference: string; extra: unknown }[]
}

interface Loaded {
  product: { id: string; sku: string; subcategoryId: string | null }
  definitions: SpecDefinition[]
  templates: SubcategorySpec[]
  values: ProductKeySpecValue[]
  rows: ValueRow[]
}

interface PreparedSource {
  row: { sourceFile: string; sourceSheet: string; sourceRow: number; originalReference: string; classificationCriterion: string | null }
  savedKeys: string[]
}

const today = (): Date => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Per-product key data. The editor and a future importer both go through
 * `writeProductSpecValues`, so they share one set of rules. Values are written
 * only in the WORKING stage; PUBLISHED is produced by the publication step and
 * is what the public sheet and the store filters read.
 */
@Injectable()
export class ProductSpecValuesService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(productId: string, subcategoryOverride?: string | null): Promise<Loaded> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, subcategoryId: true },
    })
    if (!product) throw notFound('product_not_found', 'Producto no encontrado')
    const subId = subcategoryOverride === undefined ? product.subcategoryId : subcategoryOverride
    const [defRows, templateRows, valueRows] = await Promise.all([
      this.prisma.specDefinition.findMany({ include: DEFINITION_INCLUDE }),
      subId ? this.prisma.subcategorySpec.findMany({ where: { subcategoryId: subId } }) : Promise.resolve([]),
      this.prisma.productSpecValue.findMany({ where: { productId }, include: VALUE_INCLUDE }),
    ])
    return {
      product,
      definitions: defRows.map(toDomainDefinition),
      templates: templateRows.map(toDomainTemplate),
      values: valueRows.map(toDomainValue),
      rows: valueRows,
    }
  }

  // ------------------------------------------------------------------ reads

  async getValues(productId: string): Promise<ProductSpecValuesView> {
    const { product, definitions, templates, values, rows } = await this.load(productId)
    const defById = new Map(definitions.map((d) => [d.id, d]))
    const live = templates.filter((t) => t.subcategoryId === product.subcategoryId && t.status !== 'RETIRED')
    const templateBySpec = new Map(live.map((t) => [t.specDefinitionId, t]))
    const rowByKey = new Map(rows.map((r) => [`${r.specDefinitionId}:${r.stage}`, r]))

    const specIds = new Set<string>(live.map((t) => t.specDefinitionId))
    for (const v of values) specIds.add(v.specDefinitionId)

    const stageView = (def: SpecDefinition, row: ValueRow | undefined): StageValueView | null => {
      if (!row) return null
      const v = toNormalized(toDomainValue(row))
      return { state: valueState(def.dataType, v, row.state), storedState: row.state, ...v, updatedAt: row.updatedAt, updatedBy: row.updatedById }
    }

    const items: ProductSpecItemView[] = []
    for (const id of specIds) {
      const def = defById.get(id)
      if (!def) continue
      const working = stageView(def, rowByKey.get(`${id}:WORKING`))
      const published = stageView(def, rowByKey.get(`${id}:PUBLISHED`))
      const t = templateBySpec.get(id) ?? null
      const effective = working ?? published
      items.push({
        specKey: def.key,
        label: def.label,
        dataType: def.dataType,
        unit: def.unit,
        options: def.options.map((o) => ({ key: o.key, label: o.label, isActive: o.isActive })),
        template: t && { status: t.status, isRequired: t.isRequired, isFilterable: t.isFilterable, sortOrder: t.sortOrder },
        outsideTemplate: !t && (working !== null || published !== null),
        state: effective?.state ?? 'unknown',
        storedState: effective?.storedState ?? null,
        working,
        published,
        pendingChange:
          working !== null &&
          (published === null ||
            !sameAnswer(
              {
                state: working.storedState,
                value: { valueText: working.valueText, valueNumber: working.valueNumber, valueBoolean: working.valueBoolean, optionKeys: working.optionKeys },
              },
              {
                state: published.storedState,
                value: { valueText: published.valueText, valueNumber: published.valueNumber, valueBoolean: published.valueBoolean, optionKeys: published.optionKeys },
              },
            )),
      })
    }
    items.sort((a, b) => {
      const oa = a.template ? a.template.sortOrder : Number.MAX_SAFE_INTEGER
      const ob = b.template ? b.template.sortOrder : Number.MAX_SAFE_INTEGER
      return oa - ob || a.label.localeCompare(b.label, 'es')
    })

    const sources = await this.prisma.productSource.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 20 })
    return {
      productId,
      subcategoryId: product.subcategoryId,
      items,
      outsideTemplateCount: items.filter((i) => i.outsideTemplate).length,
      sources: sources.map((s) => ({
        sourceFile: s.sourceFile,
        sourceSheet: s.sourceSheet,
        sourceRow: s.sourceRow,
        cutoffDate: s.cutoffDate.toISOString().slice(0, 10),
        originalReference: s.originalReference,
        extra: s.extra,
      })),
    }
  }

  /** Required data of the APPROVED template still missing at `stage` (WORKING while editing). */
  async getMissing(productId: string, stage: KeySpecStage = 'WORKING') {
    const { product, definitions, templates, values } = await this.load(productId)
    return {
      productId,
      stage,
      subcategoryId: product.subcategoryId,
      missing: missingRequiredKeySpecs({ subcategoryId: product.subcategoryId, definitions, templates, values, stage }),
    }
  }

  /**
   * Both projections of one product, ready for the next step to wire:
   * `published` reads only PUBLISHED values (what the public sheet and filters
   * show); `draft` overlays the WORKING values (what the editor will publish).
   */
  async getProjections(productId: string) {
    const { product, definitions, templates, values } = await this.load(productId)
    const base = { subcategoryId: product.subcategoryId, definitions, templates }
    const published = buildPublishedKeySpecProjection({ ...base, values })
    const draft = buildPublishedKeySpecProjection({ ...base, values: overlayDraftValues(values) })
    return { productId, published, draft }
  }

  /** No writes. Stored values are never deleted by a subcategory change (F2). */
  async previewSubcategoryChange(productId: string, newSubcategoryId: string): Promise<SubcategoryChangePreview> {
    const target = await this.prisma.subcategory.findUnique({ where: { id: newSubcategoryId }, select: { id: true } })
    if (!target) throw notFound('subcategory_not_found', 'The subcategory does not exist.')
    const { product, definitions, templates, values } = await this.load(productId, newSubcategoryId)
    return buildSubcategoryChangePreview({
      fromSubcategoryId: product.subcategoryId,
      toSubcategoryId: newSubcategoryId,
      definitions,
      newTemplates: templates,
      values,
    })
  }

  // ----------------------------------------------------------------- writes

  /**
   * Single write contract of the editor and of the future importer.
   * - Validates through the domain (type, unit, options, template membership).
   * - Always writes the WORKING stage: a change over a published value is a new draft.
   * - A blank entry never erases; erasing needs `clear: true` (WORKING value only).
   * - `state` NOT_APPLICABLE / UNKNOWN stores an explicit answer with no value (also over a
   *   PUBLISHED value: it becomes a WORKING draft, the published view is untouched).
   *   Option rows never exist for such an answer.
   * - Idempotent: a value equal to what the editor already sees is `unchanged`.
   * - Valid entries are saved in one transaction even if others are rejected;
   *   provenance (ProductSource) is recorded when something was saved.
   */
  async writeProductSpecValues(
    productId: string,
    entries: ProductSpecWriteEntry[],
    ctx: { source: ProductSpecWriteSource; actor: { userId?: string | null } },
  ): Promise<ProductSpecWriteResult[]> {
    const { product, definitions, templates, rows } = await this.load(productId)
    const defByKey = new Map(definitions.map((d) => [d.key, d]))
    const rowByKey = new Map(rows.map((r) => [`${r.specDefinitionId}:${r.stage}`, r]))
    const actor = ctx.actor.userId ?? null

    const results: ProductSpecWriteResult[] = []
    type Op =
      | { kind: 'upsert'; def: SpecDefinition; value: NormalizedKeySpecValue; state: KeySpecValueState }
      | { kind: 'clear'; def: SpecDefinition }
    const ops: Op[] = []
    const seen = new Set<string>()
    const reject = (specKey: string, code: string, message: string) => results.push({ specKey, outcome: 'rejected', code, message })

    for (const entry of entries) {
      const { specKey } = entry
      if (seen.has(specKey)) {
        reject(specKey, 'duplicate_entry', `The datum "${specKey}" appears twice in the same write.`)
        continue
      }
      seen.add(specKey)
      const def = defByKey.get(specKey)
      if (!def) {
        reject(specKey, 'unknown_spec', `The datum "${specKey}" is not in the dictionary.`)
        continue
      }
      const input: KeySpecValueInput = {
        valueText: entry.valueText,
        valueNumber: entry.valueNumber,
        valueBoolean: entry.valueBoolean,
        optionKeys: entry.optionKeys,
        unit: entry.unit,
      }
      const working = rowByKey.get(`${def.id}:WORKING`)
      const published = rowByKey.get(`${def.id}:PUBLISHED`)

      const requested = entry.state
      if (requested !== undefined && requested !== 'KNOWN' && requested !== 'NOT_APPLICABLE' && requested !== 'UNKNOWN') {
        reject(specKey, 'invalid_state', `The state "${String(requested)}" is not valid.`)
        continue
      }

      if (entry.clear === true) {
        if (!isBlankInput(input) || (requested !== undefined && requested !== 'KNOWN')) {
          reject(specKey, 'clear_with_value', 'An entry either carries a value or asks to be cleared, not both.')
        } else if (working) ops.push({ kind: 'clear', def })
        else if (published) {
          reject(specKey, 'cannot_clear_published', 'The value is published and has no draft: a published value cannot be erased from here.')
        } else results.push({ specKey, outcome: 'unchanged' })
        continue
      }
      if (requested === 'NOT_APPLICABLE' || requested === 'UNKNOWN') {
        if (!isBlankInput(input)) {
          reject(specKey, 'state_with_value', `The state ${requested} carries no value.`)
          continue
        }
        const holder = validateKeySpecHolder(def, { subcategoryId: product.subcategoryId, templates })
        if (holder.length > 0) {
          reject(specKey, holder[0].code, holder.map((i) => i.message).join(' '))
          continue
        }
        const empty: NormalizedKeySpecValue = { valueText: null, valueNumber: null, valueBoolean: null, optionKeys: [] }
        const seenNow = working ?? published
        if (seenNow && sameAnswer({ state: seenNow.state, value: toNormalized(toDomainValue(seenNow)) }, { state: requested, value: empty })) {
          results.push({ specKey, outcome: 'unchanged' })
        } else ops.push({ kind: 'upsert', def, value: empty, state: requested })
        continue
      }
      if (isBlankInput(input)) {
        if (requested === 'KNOWN') {
          reject(specKey, 'value_required', 'The state KNOWN needs a value.')
        } else {
          results.push({ specKey, outcome: 'unchanged', code: 'blank_ignored', message: 'A blank entry never erases a value.' })
        }
        continue
      }
      if (typeof input.valueNumber === 'number' && Number.isFinite(input.valueNumber) && Math.abs(input.valueNumber) > MAX_ABS_NUMBER) {
        reject(specKey, 'number_out_of_range', `The datum "${specKey}" exceeds the storable range.`)
        continue
      }

      const verdict = validateKeySpecValue(def, input, { subcategoryId: product.subcategoryId, templates })
      if (verdict.ok === false) {
        const { issues } = verdict
        reject(specKey, issues[0].code, issues.map((i) => i.message).join(' '))
        continue
      }
      const value: NormalizedKeySpecValue = {
        ...verdict.value,
        valueNumber: verdict.value.valueNumber === null ? null : roundToScale(verdict.value.valueNumber),
      }
      const current = working ?? published
      if (current && sameAnswer({ state: current.state, value: toNormalized(toDomainValue(current)) }, { state: 'KNOWN', value })) {
        results.push({ specKey, outcome: 'unchanged' })
        continue
      }
      ops.push({ kind: 'upsert', def, value, state: 'KNOWN' })
    }

    if (ops.length > 0) {
      const source = this.sourceFor(product, ctx.source, ops.map((o) => o.def.key))
      await this.prisma.$transaction(async (tx) => {
        for (const op of ops) {
          const where = { productId_specDefinitionId_stage: { productId, specDefinitionId: op.def.id, stage: 'WORKING' as const } }
          if (op.kind === 'clear') {
            await tx.productSpecValue.delete({ where })
            continue
          }
          const columns = {
            valueText: op.value.valueText,
            valueNumber: op.value.valueNumber === null ? null : new Prisma.Decimal(op.value.valueNumber),
            valueBoolean: op.value.valueBoolean,
            state: op.state,
            updatedById: actor,
          }
          await tx.productSpecValue.upsert({
            where,
            create: { productId, specDefinitionId: op.def.id, stage: 'WORKING', dataType: op.def.dataType, ...columns },
            update: columns,
          })
          await tx.productSpecValueOption.deleteMany({ where: { productId, specDefinitionId: op.def.id, stage: 'WORKING' } })
          if (op.value.optionKeys.length > 0) {
            await tx.productSpecValueOption.createMany({
              data: op.value.optionKeys.map((optionKey) => ({ productId, specDefinitionId: op.def.id, stage: 'WORKING' as const, optionKey })),
            })
          }
        }
        await this.recordSource(tx, productId, source)
      })
      for (const op of ops) results.push({ specKey: op.def.key, outcome: 'saved' })
    }

    // Report in the order of the request.
    const order = new Map(entries.map((e, i) => [e.specKey, i]))
    return results.sort((a, b) => (order.get(a.specKey) ?? 0) - (order.get(b.specKey) ?? 0))
  }

  /**
   * Explicit editorial step, separate from product publication: the PUBLISHED set of the
   * product becomes a copy of its WORKING set (states and values copied as they are, rows
   * the draft no longer holds are removed). One transaction; idempotent. It touches neither
   * lifecycleStatus, visibility, prices nor availability.
   */
  async publishProductSpecValues(productId: string, actor: { userId?: string | null }) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
    if (!product) throw notFound('product_not_found', 'Producto no encontrado')
    const updatedById = actor.userId ?? null
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.productSpecValue.findMany({ where: { productId }, include: VALUE_INCLUDE })
      const values = rows.map(toDomainValue)
      const plan = planKeySpecPublication(
        values.filter((v) => v.stage === 'WORKING'),
        values.filter((v) => v.stage === 'PUBLISHED'),
      )
      const working = new Map(rows.filter((r) => r.stage === 'WORKING').map((r) => [r.specDefinitionId, r]))
      for (const v of plan.upsert) {
        const w = working.get(v.specDefinitionId)!
        const columns = { valueText: w.valueText, valueNumber: w.valueNumber, valueBoolean: w.valueBoolean, state: w.state, updatedById }
        await tx.productSpecValue.upsert({
          where: { productId_specDefinitionId_stage: { productId, specDefinitionId: w.specDefinitionId, stage: 'PUBLISHED' } },
          create: { productId, specDefinitionId: w.specDefinitionId, stage: 'PUBLISHED', dataType: w.dataType, ...columns },
          update: columns,
        })
        await tx.productSpecValueOption.deleteMany({ where: { productId, specDefinitionId: w.specDefinitionId, stage: 'PUBLISHED' } })
        if (w.options.length > 0) {
          await tx.productSpecValueOption.createMany({
            data: w.options.map((o) => ({ productId, specDefinitionId: w.specDefinitionId, stage: 'PUBLISHED' as const, optionKey: o.optionKey })),
          })
        }
      }
      if (plan.remove.length > 0) {
        // Option rows of a removed value go with it (ON DELETE CASCADE).
        await tx.productSpecValue.deleteMany({ where: { productId, stage: 'PUBLISHED', specDefinitionId: { in: plan.remove } } })
      }
      return { productId, published: plan.upsert.length, unchanged: plan.unchanged, removed: plan.remove.length }
    })
  }

  private sourceFor(product: { id: string; sku: string }, source: ProductSpecWriteSource, savedKeys: string[]) {
    const row = {
      productId: product.id,
      sourceFile: (source.ref ?? source.kind).trim(),
      sourceSheet: (source.sheet ?? product.id).trim(),
      sourceRow: source.row ?? 1,
      cutoffDate: today().toISOString().slice(0, 10),
      originalReference: product.sku,
      originalDescription: null,
      originalSection: null,
      originalBrandLabel: null,
      classificationCriterion: `key-specs:${source.kind}`,
      extra: {} as Record<string, string>,
    }
    const issues = validateProductSource(row)
    if (issues.length > 0) throw badRequest('invalid_source', issues.map((i) => i.message).join(' '))
    return { row, savedKeys }
  }

  /** Same identity (file, sheet, row, cutoff) re-records into the same row; never another product's. */
  private async recordSource(tx: Prisma.TransactionClient, productId: string, source: PreparedSource) {
    const { row, savedKeys } = source
    const where = {
      sourceFile_sourceSheet_sourceRow_cutoffDate: {
        sourceFile: row.sourceFile,
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        cutoffDate: today(),
      },
    }
    const existing = await tx.productSource.findUnique({ where })
    if (existing && existing.productId !== productId) {
      throw conflict('source_identity_taken', 'That source row already belongs to another product.')
    }
    const previous = ((existing?.extra as { specKeys?: string[] } | null)?.specKeys ?? []) as string[]
    const extra = { specKeys: [...new Set([...previous, ...savedKeys])].sort() }
    if (existing) await tx.productSource.update({ where: { id: existing.id }, data: { extra } })
    else {
      await tx.productSource.create({
        data: {
          productId,
          sourceFile: row.sourceFile,
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
          cutoffDate: today(),
          originalReference: row.originalReference,
          classificationCriterion: row.classificationCriterion,
          extra,
        },
      })
    }
  }
}
