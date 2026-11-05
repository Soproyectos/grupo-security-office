import { SpecDictionaryService } from './spec-dictionary.service'

const current = {
  id: 'd1', key: 'color', label: 'Color', dataType: 'OPTION', unit: null, isActive: true,
  options: [{ key: 'RED', label: 'Red', sortOrder: 10, isActive: true }],
}

function build() {
  const tx = {
    specDefinition: { update: jest.fn().mockResolvedValue({}) },
    specOption: { upsert: jest.fn().mockResolvedValue({}) },
    subcategorySpec: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  }
  const prisma = {
    specDefinition: { findFirst: jest.fn().mockResolvedValue(current), findMany: jest.fn().mockResolvedValue([current]), create: jest.fn() },
    productSpecValue: { count: jest.fn().mockResolvedValue(0) },
    productSpecValueOption: { count: jest.fn().mockResolvedValue(0) },
    subcategorySpec: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  const service = new SpecDictionaryService(prisma as never)
  jest.spyOn(service, 'get').mockResolvedValue({ ...current } as never)
  return { service, tx, prisma }
}

describe('SpecDictionaryService.update voids approvals when the public meaning changes', () => {
  it.each([
    ['label', { label: 'Colour' }],
    ['option label', { options: [{ key: 'RED', label: 'Rojo' }] }],
    ['option isActive', { options: [{ key: 'RED', label: 'Red', isActive: false }] }],
  ])('%s change sends APPROVED rows back to PROPOSED and reports the count', async (_n, dto) => {
    const { service, tx } = build()
    const res = await service.update('color', dto as never)
    expect(tx.subcategorySpec.updateMany).toHaveBeenCalledWith({
      where: { specDefinitionId: 'd1', status: 'APPROVED' },
      data: { status: 'PROPOSED', approvedById: null, approvedAt: null },
    })
    expect(res.voidedApprovals).toBe(2)
  })

  it.each([
    ['same label', { label: 'Color' }],
    ['same option', { options: [{ key: 'RED', label: 'Red' }] }],
    ['option order only', { options: [{ key: 'RED', label: 'Red', sortOrder: 5 }] }],
    ['new option', { options: [{ key: 'BLUE', label: 'Blue' }] }],
  ])('%s does not touch approvals', async (_n, dto) => {
    const { service, tx } = build()
    const res = await service.update('color', dto as never)
    expect(tx.subcategorySpec.updateMany).not.toHaveBeenCalled()
    expect(res.voidedApprovals).toBe(0)
  })
})

describe('SpecDictionaryService master-catalog rules', () => {
  it('rejects a new label equivalent to another datum (case and accents)', async () => {
    const { service, prisma } = build()
    prisma.specDefinition.findMany.mockResolvedValue([{ id: 'other', label: 'Resolución' }])
    await expect(service.create({ key: 'resolucion2', label: 'resolucion', dataType: 'TEXT' } as never)).rejects.toMatchObject({
      response: { code: 'label_duplicated', details: { existing: { id: 'other' } } },
    })
    expect(prisma.specDefinition.create).not.toHaveBeenCalled()
  })

  it('blocks relabeling an option that products already selected until confirmImpact', async () => {
    const { service, prisma, tx } = build()
    prisma.productSpecValueOption.count.mockResolvedValue(3)
    await expect(service.update('color', { options: [{ key: 'RED', label: 'Rojo' }] } as never)).rejects.toMatchObject({
      response: { code: 'option_change_with_values', details: { selections: 3 } },
    })
    expect(tx.specOption.upsert).not.toHaveBeenCalled()
    await service.update('color', { options: [{ key: 'RED', label: 'Rojo' }], confirmImpact: true } as never)
    expect(tx.specOption.upsert).toHaveBeenCalled()
  })

  it('keeps blocking a unit change while values are stored', async () => {
    const { service, prisma } = build()
    prisma.specDefinition.findFirst.mockResolvedValue({ ...current, dataType: 'NUMBER', unit: 'mm', options: [] })
    prisma.productSpecValue.count.mockResolvedValue(5)
    await expect(service.update('color', { unit: 'cm' } as never)).rejects.toMatchObject({ response: { code: 'unit_change_with_values' } })
  })

  it('reports usage with canDelete false when molds or values exist', async () => {
    const { service, prisma } = build()
    prisma.subcategorySpec.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    prisma.productSpecValue.count.mockResolvedValue(4)
    const usage = await service.usage('color')
    expect(usage.canDelete).toBe(false)
    expect(usage.counts).toMatchObject({ templateEntries: 2, approvedTemplateEntries: 1, productValues: 4 })
  })

  it('searches the dictionary by label or key ignoring accents', async () => {
    const { service, prisma } = build()
    prisma.specDefinition.findMany.mockResolvedValue([
      { ...current, id: 'a', key: 'resolucion', label: 'Resolución', options: [] },
      { ...current, id: 'b', key: 'color', label: 'Color', options: [] },
    ])
    expect((await service.list({ q: 'resolucion' })).map((d) => d.id)).toEqual(['a'])
  })
})
