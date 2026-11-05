import { Prisma } from '@prisma/client'
import { ProductSpecValuesService } from './product-spec-values.service'

const def = (key: string, dataType: string, extra: Record<string, unknown> = {}) => ({
  id: `def-${key}`, key, label: key, dataType, unit: null, isActive: true, options: [], ...extra,
})

function makeService(opts: { product?: unknown; values?: unknown[] } = {}) {
  const tx = {
    productSpecValue: { upsert: jest.fn(), delete: jest.fn() },
    productSpecValueOption: { deleteMany: jest.fn(), createMany: jest.fn() },
    productSource: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
  }
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue('product' in opts ? opts.product : { id: 'p1', sku: 'SKU-1', subcategoryId: 's1' }) },
    specDefinition: { findMany: jest.fn().mockResolvedValue([def('watts', 'NUMBER', { unit: 'W' }), def('note', 'TEXT')]) },
    subcategorySpec: {
      findMany: jest.fn().mockResolvedValue(
        ['watts', 'note'].map((k, i) => ({
          subcategoryId: 's1', specDefinitionId: `def-${k}`, status: 'PROPOSED', isRequired: false, isFilterable: false,
          requiredReason: null, sortOrder: i, approvedById: null, approvedAt: null,
        })),
      ),
    },
    productSpecValue: { findMany: jest.fn().mockResolvedValue(opts.values ?? []) },
    productSource: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { service: new ProductSpecValuesService(prisma as never), prisma, tx }
}

const ctx = { source: { kind: 'editor' }, actor: { userId: 'u1' } }

describe('ProductSpecValuesService.writeProductSpecValues', () => {
  it('404s for an unknown product', async () => {
    const { service } = makeService({ product: null })
    await expect(service.writeProductSpecValues('nope', [], ctx)).rejects.toMatchObject({ response: { code: 'product_not_found' } })
  })

  it('rejects unknown data and a wrong unit without opening a transaction', async () => {
    const { service, prisma } = makeService()
    const r = await service.writeProductSpecValues('p1', [{ specKey: 'ghost', valueText: 'x' }, { specKey: 'watts', valueNumber: 5, unit: 'kW' }], ctx)
    expect(r.map((x) => [x.outcome, x.code])).toEqual([['rejected', 'unknown_spec'], ['rejected', 'unit_mismatch']])
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('never erases on a blank entry and never writes', async () => {
    const { service, prisma } = makeService()
    const r = await service.writeProductSpecValues('p1', [{ specKey: 'note', valueText: '  ' }, { specKey: 'watts' }], ctx)
    expect(r.map((x) => x.outcome)).toEqual(['unchanged', 'unchanged'])
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('writes only the WORKING stage, with the actor, and records the source', async () => {
    const { service, tx } = makeService()
    const r = await service.writeProductSpecValues('p1', [{ specKey: 'watts', valueNumber: 0, unit: 'W' }], ctx)
    expect(r).toEqual([{ specKey: 'watts', outcome: 'saved' }])
    const call = tx.productSpecValue.upsert.mock.calls[0][0]
    expect(call.where.productId_specDefinitionId_stage.stage).toBe('WORKING')
    expect(call.create).toMatchObject({ stage: 'WORKING', dataType: 'NUMBER', updatedById: 'u1' })
    expect(Number(call.create.valueNumber)).toBe(0)
    expect(tx.productSource.create).toHaveBeenCalledTimes(1)
  })

  it('refuses to clear a published value that has no draft', async () => {
    const published = {
      productId: 'p1', specDefinitionId: 'def-note', stage: 'PUBLISHED', dataType: 'TEXT', valueText: 'a',
      valueNumber: null, valueBoolean: null, updatedById: null, updatedAt: new Date(), options: [],
    }
    const { service, prisma } = makeService({ values: [published] })
    const r = await service.writeProductSpecValues('p1', [{ specKey: 'note', clear: true }], ctx)
    expect(r[0]).toMatchObject({ outcome: 'rejected', code: 'cannot_clear_published' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('ProductSpecValuesService.writeProductSpecValues — explicit states', () => {
  const row = (over: Record<string, unknown>) => ({
    productId: 'p1', specDefinitionId: 'def-watts', stage: 'WORKING', dataType: 'NUMBER', state: 'KNOWN', valueText: null,
    valueNumber: null, valueBoolean: null, updatedById: null, updatedAt: new Date(), options: [], ...over,
  })

  it('stores NOT_APPLICABLE and UNKNOWN with no value and no option rows', async () => {
    const { service, tx } = makeService()
    const r = await service.writeProductSpecValues('p1', [
      { specKey: 'watts', state: 'NOT_APPLICABLE' },
      { specKey: 'note', state: 'UNKNOWN' },
    ], ctx)
    expect(r.map((x) => x.outcome)).toEqual(['saved', 'saved'])
    const calls = tx.productSpecValue.upsert.mock.calls.map((c) => c[0])
    expect(calls.map((c) => c.create.state)).toEqual(['NOT_APPLICABLE', 'UNKNOWN'])
    for (const c of calls) {
      expect(c.create).toMatchObject({ stage: 'WORKING', valueText: null, valueNumber: null, valueBoolean: null })
      expect(c.update.state).toBeDefined()
    }
    // Existing option rows of the datum are removed and none is created.
    expect(tx.productSpecValueOption.deleteMany).toHaveBeenCalledTimes(2)
    expect(tx.productSpecValueOption.createMany).not.toHaveBeenCalled()
  })

  it('rejects a non-KNOWN state that carries a value (state_with_value), zero included', async () => {
    const { service, prisma } = makeService()
    const r = await service.writeProductSpecValues('p1', [
      { specKey: 'watts', state: 'NOT_APPLICABLE', valueNumber: 0 },
      { specKey: 'note', state: 'UNKNOWN', valueText: 'x' },
    ], ctx)
    expect(r.map((x) => [x.outcome, x.code])).toEqual([['rejected', 'state_with_value'], ['rejected', 'state_with_value']])
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an explicit KNOWN without a value (value_required) but still ignores a plain blank entry', async () => {
    const { service } = makeService()
    const r = await service.writeProductSpecValues('p1', [{ specKey: 'watts', state: 'KNOWN' }, { specKey: 'note' }], ctx)
    expect(r.map((x) => [x.outcome, x.code])).toEqual([['rejected', 'value_required'], ['unchanged', 'blank_ignored']])
  })

  it('rejects an invalid state and a state combined with clear', async () => {
    const { service } = makeService()
    const r = await service.writeProductSpecValues('p1', [
      { specKey: 'watts', state: 'MAYBE' as never },
      { specKey: 'note', state: 'UNKNOWN', clear: true },
    ], ctx)
    expect(r.map((x) => x.code)).toEqual(['invalid_state', 'clear_with_value'])
  })

  it('writes a WORKING NOT_APPLICABLE over a PUBLISHED value without touching the published row', async () => {
    const published = row({ stage: 'PUBLISHED', valueNumber: new Prisma.Decimal(5) })
    const { service, tx } = makeService({ values: [published] })
    const r = await service.writeProductSpecValues('p1', [{ specKey: 'watts', state: 'NOT_APPLICABLE' }], ctx)
    expect(r).toEqual([{ specKey: 'watts', outcome: 'saved' }])
    expect(tx.productSpecValue.upsert).toHaveBeenCalledTimes(1)
    expect(tx.productSpecValue.upsert.mock.calls[0][0].where.productId_specDefinitionId_stage.stage).toBe('WORKING')
    expect(tx.productSpecValue.delete).not.toHaveBeenCalled()
  })

  it('is idempotent on the state: the same answer is unchanged, a different one is saved', async () => {
    const working = row({ state: 'UNKNOWN' })
    const { service, prisma } = makeService({ values: [working] })
    const same = await service.writeProductSpecValues('p1', [{ specKey: 'watts', state: 'UNKNOWN' }], ctx)
    expect(same).toEqual([{ specKey: 'watts', outcome: 'unchanged' }])
    expect(prisma.$transaction).not.toHaveBeenCalled()
    const other = await service.writeProductSpecValues('p1', [{ specKey: 'watts', state: 'NOT_APPLICABLE' }], ctx)
    expect(other[0].outcome).toBe('saved')
  })

  it('a KNOWN zero over an UNKNOWN row is a change; a KNOWN zero over a KNOWN zero is not', async () => {
    const unknown = makeService({ values: [row({ state: 'UNKNOWN' })] })
    const a = await unknown.service.writeProductSpecValues('p1', [{ specKey: 'watts', valueNumber: 0 }], ctx)
    expect(a[0].outcome).toBe('saved')
    expect(unknown.tx.productSpecValue.upsert.mock.calls[0][0].create.state).toBe('KNOWN')
    const known = makeService({ values: [row({ valueNumber: new Prisma.Decimal(0) })] })
    const b = await known.service.writeProductSpecValues('p1', [{ specKey: 'watts', valueNumber: 0 }], ctx)
    expect(b[0].outcome).toBe('unchanged')
  })

  it('getValues exposes the stored state and keeps unknown and not applicable distinct', async () => {
    const { service } = makeService({
      values: [
        row({ specDefinitionId: 'def-watts', state: 'NOT_APPLICABLE' }),
        row({ specDefinitionId: 'def-note', dataType: 'TEXT', state: 'UNKNOWN' }),
      ],
    })
    const view = await service.getValues('p1')
    const watts = view.items.find((i) => i.specKey === 'watts')!
    const note = view.items.find((i) => i.specKey === 'note')!
    expect([watts.state, watts.storedState, watts.working?.storedState]).toEqual(['not_applicable', 'NOT_APPLICABLE', 'NOT_APPLICABLE'])
    expect([note.state, note.storedState]).toEqual(['unknown', 'UNKNOWN'])
  })
})
