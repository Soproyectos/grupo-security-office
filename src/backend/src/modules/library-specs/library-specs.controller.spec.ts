import { REQUIRED_GRANTS_KEY } from '../../common/security/require-grant'
import { LibrarySpecsController } from './library-specs.controller'

describe('LibrarySpecsController permissions', () => {
  const proto = LibrarySpecsController.prototype as unknown as Record<string, unknown>
  const grantsOf = (name: string) => Reflect.getMetadata(REQUIRED_GRANTS_KEY, proto[name] as object)
  const handlers = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && n !== 'actor' && typeof proto[n] === 'function',
  )

  it('declares a grant on every handler (a handler without one answers 403)', () => {
    expect(handlers.length).toBeGreaterThan(0)
    for (const name of handlers) expect(grantsOf(name)).toBeDefined()
  })

  it('reuses the product grants: read for GET, write for changes', () => {
    for (const name of ['listDefinitions', 'getDefinition', 'getTemplate', 'getValues', 'getMissing', 'preview', 'projection']) {
      expect(grantsOf(name)).toEqual(['products:read'])
    }
    for (const name of ['createDefinition', 'updateDefinition', 'putTemplate', 'putValues']) {
      expect(grantsOf(name)).toEqual(['products:write'])
    }
    expect(grantsOf('publish')).toEqual(['products:write', 'products:publish'])
    expect(grantsOf('approve')).toEqual(['products:write', 'products:approveSpecs'])
  })

  it('master-catalog usage endpoints require masters:read', () => {
    expect(grantsOf('definitionUsage')).toEqual(['masters:read'])
    expect(grantsOf('templateUsage')).toEqual(['masters:read'])
  })

  it('tags editor writes with the editor source and the caller as actor', async () => {
    const values = { writeProductSpecValues: jest.fn().mockResolvedValue([]) }
    const controller = new LibrarySpecsController({} as never, {} as never, values as never)
    await controller.putValues('p1', { entries: [{ specKey: 'a', valueText: 'x' }] } as never, { sub: 'u1' })
    expect(values.writeProductSpecValues).toHaveBeenCalledWith('p1', [{ specKey: 'a', valueText: 'x' }], {
      source: { kind: 'editor' },
      actor: { userId: 'u1' },
    })
  })

  it('approves as the authenticated user and never reads the approver from the body', async () => {
    const templates = { approve: jest.fn().mockResolvedValue({ outcome: 'approved' }) }
    const controller = new LibrarySpecsController({} as never, templates as never, {} as never)
    await controller.approve('s1', 'k', { reason: 'why', approvedBy: 'someone-else' } as never, { id: 'u9' })
    expect(templates.approve).toHaveBeenCalledWith('s1', 'k', 'u9', { reason: 'why', approvedBy: 'someone-else' })
  })

  it('rejects an invalid stage and a missing target subcategory', () => {
    const controller = new LibrarySpecsController({} as never, {} as never, {} as never)
    expect(() => controller.getMissing('p', 'DRAFT')).toThrow()
    expect(() => controller.preview('p', undefined)).toThrow()
  })

  it('publishes key specs as the caller without touching the product', async () => {
    const values = { publishProductSpecValues: jest.fn().mockResolvedValue({ productId: 'p1', published: 1, unchanged: 0, removed: 0 }) }
    const controller = new LibrarySpecsController({} as never, {} as never, values as never)
    await expect(controller.publish('p1', { sub: 'u1' })).resolves.toEqual({ productId: 'p1', published: 1, unchanged: 0, removed: 0 })
    expect(values.publishProductSpecValues).toHaveBeenCalledWith('p1', { userId: 'u1' })
  })
})
