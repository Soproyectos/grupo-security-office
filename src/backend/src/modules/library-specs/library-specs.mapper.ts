/**
 * Maps Prisma rows to the storage-agnostic domain types of
 * `modules/products/key-specs`, so the service layer reuses the domain rules
 * instead of re-implementing them.
 */
import type { Prisma } from '@prisma/client'
import type {
  ProductKeySpecValue,
  SpecDefinition,
  SubcategorySpec,
} from '../products/key-specs/key-spec.types'

export const DEFINITION_INCLUDE = {
  options: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] },
} satisfies Prisma.SpecDefinitionInclude

export type DefinitionRow = Prisma.SpecDefinitionGetPayload<{ include: typeof DEFINITION_INCLUDE }>
export type TemplateRow = Prisma.SubcategorySpecGetPayload<Record<string, never>>
export type ValueRow = Prisma.ProductSpecValueGetPayload<{ include: { options: true } }>

export function toDomainDefinition(row: DefinitionRow): SpecDefinition {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    dataType: row.dataType,
    unit: row.unit,
    isActive: row.isActive,
    options: row.options.map((o) => ({ key: o.key, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive })),
  }
}

export function toDomainTemplate(row: TemplateRow): SubcategorySpec {
  return {
    subcategoryId: row.subcategoryId,
    specDefinitionId: row.specDefinitionId,
    status: row.status,
    isRequired: row.isRequired,
    isFilterable: row.isFilterable,
    requiredReason: row.requiredReason,
    sortOrder: row.sortOrder,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt,
  }
}

export function toDomainValue(row: ValueRow): ProductKeySpecValue {
  return {
    productId: row.productId,
    specDefinitionId: row.specDefinitionId,
    stage: row.stage,
    valueText: row.valueText,
    valueNumber: row.valueNumber === null ? null : row.valueNumber.toNumber(),
    valueBoolean: row.valueBoolean,
    optionKeys: row.options.map((o) => o.optionKey).sort(),
    state: row.state,
  }
}
