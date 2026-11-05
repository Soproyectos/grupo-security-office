import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { CreateSpecDefinitionDto, SpecOptionInputDto, UpdateSpecDefinitionDto } from './dto/library-specs.dto'
import { DEFINITION_INCLUDE, type DefinitionRow } from './library-specs.mapper'
import { badRequest, conflict, notFound } from './library-specs.rules'
import { buildUsageReport, findNameCollision, normalizeMasterName } from '../masters/master-rules'

const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/
const OPTION_TYPES = ['OPTION', 'MULTI_OPTION']

export interface SpecDefinitionView {
  id: string
  key: string
  label: string
  dataType: DefinitionRow['dataType']
  unit: string | null
  isActive: boolean
  options: { key: string; label: string; sortOrder: number; isActive: boolean }[]
}

const toView = (row: DefinitionRow): SpecDefinitionView => ({
  id: row.id,
  key: row.key,
  label: row.label,
  dataType: row.dataType,
  unit: row.unit,
  isActive: row.isActive,
  options: row.options.map((o) => ({ key: o.key, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive })),
})

/** Dictionary of key data. Nothing here deletes anything: options and data are deactivated. */
@Injectable()
export class SpecDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** `q` filters by label or key, ignoring case and accents. */
  async list(opts: { includeInactive?: boolean; q?: string } = {}): Promise<SpecDefinitionView[]> {
    const rows = await this.prisma.specDefinition.findMany({
      where: opts.includeInactive ? {} : { isActive: true },
      include: DEFINITION_INCLUDE,
      orderBy: [{ label: 'asc' }, { key: 'asc' }],
    })
    const needle = normalizeMasterName(opts.q)
    const found = needle ? rows.filter((r) => normalizeMasterName(`${r.label} ${r.key}`).includes(needle)) : rows
    return found.map(toView)
  }

  /** Dependencies of a datum: molds that ask for it and stored product values. Informational: nothing here deletes. */
  async usage(idOrKey: string) {
    const current = await this.prisma.specDefinition.findFirst({ where: { OR: [{ id: idOrKey }, { key: idOrKey }] }, select: { id: true } })
    if (!current) throw notFound('spec_definition_not_found', 'The datum does not exist.')
    const [templateEntries, approvedTemplateEntries, productValues, optionSelections] = await Promise.all([
      this.prisma.subcategorySpec.count({ where: { specDefinitionId: current.id } }),
      this.prisma.subcategorySpec.count({ where: { specDefinitionId: current.id, status: 'APPROVED' } }),
      this.prisma.productSpecValue.count({ where: { specDefinitionId: current.id } }),
      this.prisma.productSpecValueOption.count({ where: { specDefinitionId: current.id } }),
    ])
    return buildUsageReport(current.id, { templateEntries, approvedTemplateEntries, productValues, optionSelections }, [
      { key: 'templateEntries', code: 'IN_MOLDS', message: (n) => `está en ${n} molde(s)` },
      { key: 'productValues', code: 'HAS_VALUES', message: (n) => `tiene ${n} valor(es) guardado(s) en productos` },
    ])
  }

  private async assertLabelFree(label: string, selfId?: string) {
    const rows = await this.prisma.specDefinition.findMany({ select: { id: true, label: true } })
    const clash = findNameCollision(label, (rows ?? []).map((r) => ({ id: r.id, name: r.label })), selfId)
    if (clash) {
      throw conflict('label_duplicated', `Ya existe un dato con una etiqueta equivalente: «${clash.name}».`, { existing: { id: clash.id, label: clash.name } })
    }
  }

  /** `idOrKey` accepts the id or the stable key. */
  async get(idOrKey: string): Promise<SpecDefinitionView> {
    const row = await this.prisma.specDefinition.findFirst({
      where: { OR: [{ id: idOrKey }, { key: idOrKey }] },
      include: DEFINITION_INCLUDE,
    })
    if (!row) throw notFound('spec_definition_not_found', 'The datum does not exist.')
    return toView(row)
  }

  async create(dto: CreateSpecDefinitionDto): Promise<SpecDefinitionView> {
    const key = dto.key.trim()
    if (!KEY_RE.test(key)) throw badRequest('invalid_key', 'The key must be lowercase snake_case (a-z, 0-9, _), starting with a letter.')
    const label = dto.label.trim()
    if (!label) throw badRequest('label_required', 'The label is required.')
    const unit = dto.unit?.trim() || null
    if (unit && dto.dataType !== 'NUMBER') throw badRequest('unit_not_allowed', 'Only NUMBER data carry a unit.')
    const options = dto.options ?? []
    if (OPTION_TYPES.includes(dto.dataType)) {
      if (options.length === 0) throw badRequest('options_required', 'OPTION and MULTI_OPTION data need at least one option.')
    } else if (options.length > 0) {
      throw badRequest('options_not_allowed', 'Only OPTION and MULTI_OPTION data take options.')
    }
    this.assertOptions(options)
    await this.assertLabelFree(label)

    try {
      const row = await this.prisma.specDefinition.create({
        data: {
          key,
          label,
          dataType: dto.dataType,
          unit,
          options: { create: options.map((o, i) => this.optionData(o, (i + 1) * 10)) },
        },
        include: DEFINITION_INCLUDE,
      })
      return toView(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('spec_key_taken', `The key "${key}" already exists.`)
      }
      throw e
    }
  }

  /**
   * Changing the public meaning of a datum (its label, or the label / active flag of an option) voids the approval of
   * every APPROVED template row that uses it; `voidedApprovals` says how many rows went back to PROPOSED.
   */
  async update(idOrKey: string, dto: UpdateSpecDefinitionDto): Promise<SpecDefinitionView & { voidedApprovals: number }> {
    const current = await this.prisma.specDefinition.findFirst({
      where: { OR: [{ id: idOrKey }, { key: idOrKey }] },
      include: DEFINITION_INCLUDE,
    })
    if (!current) throw notFound('spec_definition_not_found', 'The datum does not exist.')

    const data: Prisma.SpecDefinitionUpdateInput = {}
    if (dto.label !== undefined) {
      const label = dto.label.trim()
      if (!label) throw badRequest('label_required', 'The label is required.')
      if (label !== current.label) await this.assertLabelFree(label, current.id)
      data.label = label
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.unit !== undefined) {
      const unit = dto.unit?.trim() || null
      if (unit !== current.unit) {
        if (current.dataType !== 'NUMBER') throw badRequest('unit_not_allowed', 'Only NUMBER data carry a unit.')
        const stored = await this.prisma.productSpecValue.count({ where: { specDefinitionId: current.id } })
        if (stored > 0) {
          throw conflict('unit_change_with_values', 'The unit cannot change while product values are stored in it.')
        }
        data.unit = unit
      }
    }
    const options = dto.options ?? []
    if (options.length > 0) {
      if (!OPTION_TYPES.includes(current.dataType)) throw badRequest('options_not_allowed', 'Only OPTION and MULTI_OPTION data take options.')
      this.assertOptions(options)
    }

    const meaningChanged =
      (data.label !== undefined && data.label !== current.label) ||
      options.some((o) => {
        const prev = current.options.find((p) => p.key === o.key.trim())
        return !!prev && (prev.label !== o.label.trim() || (o.isActive !== undefined && o.isActive !== prev.isActive))
      })
    // A relabeled or deactivated option that products already selected would silently change what they say.
    if (!dto.confirmImpact) {
      const changedKeys = options
        .filter((o) => {
          const prev = current.options.find((p) => p.key === o.key.trim())
          return !!prev && (prev.label !== o.label.trim() || (o.isActive === false && prev.isActive))
        })
        .map((o) => o.key.trim())
      if (changedKeys.length > 0) {
        const selections = await this.prisma.productSpecValueOption.count({
          where: { specDefinitionId: current.id, optionKey: { in: changedKeys } },
        })
        if (selections > 0) {
          throw conflict('option_change_with_values', 'Changing these options affects values already stored in products. Resend with confirmImpact=true to proceed.', {
            selections,
            optionKeys: changedKeys,
          })
        }
      }
    }
    let voidedApprovals = 0
    await this.prisma.$transaction(async (tx) => {
      if (meaningChanged) {
        const voided = await tx.subcategorySpec.updateMany({
          where: { specDefinitionId: current.id, status: 'APPROVED' },
          data: { status: 'PROPOSED', approvedById: null, approvedAt: null },
        })
        voidedApprovals = voided.count
      }
      if (Object.keys(data).length > 0) await tx.specDefinition.update({ where: { id: current.id }, data })
      for (const o of options) {
        await tx.specOption.upsert({
          where: { specDefinitionId_key: { specDefinitionId: current.id, key: o.key.trim() } },
          create: { specDefinitionId: current.id, ...this.optionData(o, (current.options.length + 1) * 10) },
          update: {
            label: o.label.trim(),
            ...(o.sortOrder !== undefined ? { sortOrder: o.sortOrder } : {}),
            ...(o.isActive !== undefined ? { isActive: o.isActive } : {}),
          },
        })
      }
    })
    return { ...(await this.get(current.id)), voidedApprovals }
  }

  private optionData(o: SpecOptionInputDto, fallbackOrder: number) {
    return { key: o.key.trim(), label: o.label.trim(), sortOrder: o.sortOrder ?? fallbackOrder, isActive: o.isActive ?? true }
  }

  private assertOptions(options: SpecOptionInputDto[]) {
    const seen = new Set<string>()
    for (const o of options) {
      const key = o.key.trim()
      if (!key || !o.label.trim()) throw badRequest('option_invalid', 'Every option needs a key and a label.')
      if (seen.has(key)) throw badRequest('option_duplicated', `The option key "${key}" is repeated.`)
      seen.add(key)
    }
  }
}
