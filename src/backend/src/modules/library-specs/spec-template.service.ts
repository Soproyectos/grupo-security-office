import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { validateSubcategorySpec } from '../products/key-specs/key-spec-value.validation'
import type { KeySpecIssue, SubcategorySpec } from '../products/key-specs/key-spec.types'
import type { ApproveTemplateEntryDto, TemplateEntryInputDto } from './dto/library-specs.dto'
import { badRequest, conflict, issuesToDetails, notFound } from './library-specs.rules'

export interface TemplateEntryView {
  specKey: string
  label: string
  dataType: string
  unit: string | null
  specActive: boolean
  status: 'PROPOSED' | 'APPROVED' | 'RETIRED'
  isRequired: boolean
  isFilterable: boolean
  requiredReason: string | null
  sortOrder: number
  approvedBy: string | null
  approvedAt: Date | null
  /** Only APPROVED rows count for readiness, projection and filters (F6). */
  counts: boolean
}

export interface TemplateView {
  subcategoryId: string
  entries: TemplateEntryView[]
  summary: { proposed: number; approved: number; retired: number }
}

export interface TemplateEntryResult {
  specKey: string
  outcome: 'created' | 'updated' | 'unchanged'
  approvalReset?: boolean
}

/** Templates ("moldes") of subcategories. Approval is an explicit action, never a side effect. */
@Injectable()
export class SpecTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSubcategory(subcategoryId: string) {
    const sub = await this.prisma.subcategory.findUnique({ where: { id: subcategoryId }, select: { id: true } })
    if (!sub) throw notFound('subcategory_not_found', 'The subcategory does not exist.')
  }

  /** Mold usage of a subcategory: entries by status and the products that would be affected by a mold change. */
  async usage(subcategoryId: string) {
    await this.assertSubcategory(subcategoryId)
    const [proposed, approved, retired, products, storedValues] = await Promise.all([
      this.prisma.subcategorySpec.count({ where: { subcategoryId, status: 'PROPOSED' } }),
      this.prisma.subcategorySpec.count({ where: { subcategoryId, status: 'APPROVED' } }),
      this.prisma.subcategorySpec.count({ where: { subcategoryId, status: 'RETIRED' } }),
      this.prisma.product.count({ where: { subcategoryId } }),
      this.prisma.productSpecValue.count({ where: { product: { subcategoryId } } }),
    ])
    return { id: subcategoryId, counts: { proposed, approved, retired, products, storedValues } }
  }

  async get(subcategoryId: string): Promise<TemplateView> {
    await this.assertSubcategory(subcategoryId)
    const rows = await this.prisma.subcategorySpec.findMany({
      where: { subcategoryId },
      include: { definition: true },
      orderBy: [{ sortOrder: 'asc' }, { specDefinitionId: 'asc' }],
    })
    const entries: TemplateEntryView[] = rows.map((r) => ({
      specKey: r.definition.key,
      label: r.definition.label,
      dataType: r.definition.dataType,
      unit: r.definition.unit,
      specActive: r.definition.isActive,
      status: r.status,
      isRequired: r.isRequired,
      isFilterable: r.isFilterable,
      requiredReason: r.requiredReason,
      sortOrder: r.sortOrder,
      approvedBy: r.approvedById,
      approvedAt: r.approvedAt,
      counts: r.status === 'APPROVED',
    }))
    return {
      subcategoryId,
      entries,
      summary: {
        proposed: entries.filter((e) => e.status === 'PROPOSED').length,
        approved: entries.filter((e) => e.status === 'APPROVED').length,
        retired: entries.filter((e) => e.status === 'RETIRED').length,
      },
    }
  }

  /**
   * Upserts template rows. All-or-nothing: if any entry is invalid nothing is
   * written. Never deletes: removing a datum is `status: RETIRED`. Never
   * approves: APPROVED is refused here, and changing the required flag, its
   * justification or the filterable flag of an approved row sends it back to PROPOSED.
   */
  async upsertEntries(subcategoryId: string, entries: TemplateEntryInputDto[]) {
    await this.assertSubcategory(subcategoryId)
    const keys = [...new Set(entries.map((e) => e.specKey))]
    const [defs, existingRows] = await Promise.all([
      this.prisma.specDefinition.findMany({ where: { key: { in: keys } } }),
      this.prisma.subcategorySpec.findMany({ where: { subcategoryId, definition: { key: { in: keys } } } }),
    ])
    const defByKey = new Map(defs.map((d) => [d.key, d]))
    const rowByDef = new Map(existingRows.map((r) => [r.specDefinitionId, r]))

    const issues: KeySpecIssue[] = []
    const plan: { defId: string; data: Prisma.SubcategorySpecUncheckedCreateInput; result: TemplateEntryResult }[] = []
    const seen = new Set<string>()

    for (const e of entries) {
      const issue = (code: string, message: string) => issues.push({ code, specKey: e.specKey, message })
      if (seen.has(e.specKey)) {
        issue('duplicate_entry', `The datum "${e.specKey}" appears twice.`)
        continue
      }
      seen.add(e.specKey)
      const def = defByKey.get(e.specKey)
      if (!def) {
        issue('unknown_spec', `The datum "${e.specKey}" is not in the dictionary.`)
        continue
      }
      if ((e.status as string | undefined) === 'APPROVED') {
        issue('approval_requires_explicit_action', 'A row is approved only with the approve action, naming who approves it.')
        continue
      }
      const prev = rowByDef.get(def.id) ?? null
      if (!prev && !def.isActive) {
        issue('definition_inactive', `The datum "${e.specKey}" is inactive and cannot enter a template.`)
        continue
      }

      const isRequired = e.isRequired ?? prev?.isRequired ?? false
      const requiredReason = e.requiredReason !== undefined ? e.requiredReason?.trim() || null : prev?.requiredReason ?? null
      const isFilterable = e.isFilterable ?? prev?.isFilterable ?? false
      const sortOrder = e.sortOrder ?? prev?.sortOrder ?? 0
      let status: SubcategorySpec['status'] = e.status ?? (prev?.status === 'APPROVED' ? 'APPROVED' : prev?.status ?? 'PROPOSED')

      // The approval was given to a specific "required + reason + filterable"; changing any of them needs a new approval
      // (sort order is presentation only and keeps it).
      const approvalReset =
        prev?.status === 'APPROVED' &&
        status === 'APPROVED' &&
        (isRequired !== prev.isRequired || requiredReason !== prev.requiredReason || isFilterable !== prev.isFilterable)
      if (approvalReset) status = 'PROPOSED'
      const keepsApproval = status === 'APPROVED' || (status === 'RETIRED' && prev?.status === 'APPROVED')

      const next = {
        subcategoryId,
        specDefinitionId: def.id,
        status,
        isRequired,
        isFilterable,
        requiredReason,
        sortOrder,
        approvedById: keepsApproval ? prev?.approvedById ?? null : null,
        approvedAt: keepsApproval ? prev?.approvedAt ?? null : null,
      } satisfies Prisma.SubcategorySpecUncheckedCreateInput

      const rowIssues = validateSubcategorySpec(next as SubcategorySpec)
      for (const ri of rowIssues) issue(ri.code, ri.message)
      if (rowIssues.length > 0) continue

      const unchanged =
        prev !== null &&
        prev.status === next.status &&
        prev.isRequired === next.isRequired &&
        prev.isFilterable === next.isFilterable &&
        prev.requiredReason === next.requiredReason &&
        prev.sortOrder === next.sortOrder &&
        prev.approvedById === next.approvedById
      plan.push({
        defId: def.id,
        data: next,
        result: {
          specKey: e.specKey,
          outcome: unchanged ? 'unchanged' : prev ? 'updated' : 'created',
          ...(approvalReset ? { approvalReset: true } : {}),
        },
      })
    }

    if (issues.length > 0) {
      throw badRequest('invalid_template_entries', 'The template was not saved: fix the listed entries.', issuesToDetails(issues))
    }

    await this.prisma.$transaction(
      plan
        .filter((p) => p.result.outcome !== 'unchanged')
        .map((p) =>
          this.prisma.subcategorySpec.upsert({
            where: { subcategoryId_specDefinitionId: { subcategoryId, specDefinitionId: p.defId } },
            create: p.data,
            update: {
              status: p.data.status,
              isRequired: p.data.isRequired,
              isFilterable: p.data.isFilterable,
              requiredReason: p.data.requiredReason,
              sortOrder: p.data.sortOrder,
              approvedById: p.data.approvedById,
              approvedAt: p.data.approvedAt,
            },
          }),
        ),
    )
    return { results: plan.map((p) => p.result), template: await this.get(subcategoryId) }
  }

  /**
   * Explicit approval. `approverId` is the authenticated user's id (taken from the session by the controller,
   * never from the request body); a required row also needs a written justification.
   */
  async approve(subcategoryId: string, specKey: string, approverId: string, dto: ApproveTemplateEntryDto, now: Date = new Date()) {
    await this.assertSubcategory(subcategoryId)
    const approver = approverId?.trim()
    if (!approver) throw badRequest('approver_required', 'Approving a template row requires an authenticated approver.')
    const row = await this.prisma.subcategorySpec.findFirst({
      where: { subcategoryId, definition: { key: specKey } },
      include: { definition: true },
    })
    if (!row) throw notFound('template_entry_not_found', `The datum "${specKey}" is not in this template.`)
    if (row.status === 'RETIRED') throw conflict('retired_entry', 'A retired row must be set back to PROPOSED before it can be approved.')
    if (row.status === 'APPROVED') return { outcome: 'unchanged' as const, template: await this.get(subcategoryId) }
    if (!row.definition.isActive) throw conflict('definition_inactive', 'An inactive datum cannot be approved.')

    const requiredReason = row.requiredReason?.trim() || dto.reason?.trim() || null
    if (row.isRequired && !requiredReason) {
      throw badRequest('required_without_reason', 'A required datum needs its written justification before approval (pass "reason").')
    }
    const issues = validateSubcategorySpec({
      subcategoryId: row.subcategoryId,
      specDefinitionId: row.specDefinitionId,
      status: 'APPROVED',
      isRequired: row.isRequired,
      isFilterable: row.isFilterable,
      requiredReason,
      sortOrder: row.sortOrder,
      approvedById: approver,
      approvedAt: now,
    })
    if (issues.length > 0) throw badRequest('invalid_template_entries', issues[0].message, issuesToDetails(issues))

    await this.prisma.subcategorySpec.update({
      where: { subcategoryId_specDefinitionId: { subcategoryId, specDefinitionId: row.specDefinitionId } },
      data: { status: 'APPROVED', requiredReason, approvedById: approver, approvedAt: now },
    })
    return { outcome: 'approved' as const, template: await this.get(subcategoryId) }
  }
}
