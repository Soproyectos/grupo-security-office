import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import { fetchValidationReport, validateBatch, validateProduct } from './validation-api'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

describe('validation-api (CAT-05 frontend)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POST /products/:id/validation recalcula y devuelve el informe', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { revisionId: 'rev-1', status: 'CON_PROBLEMAS', issues: [], rulesVersion: 'cat05-r1' } })
    const r = await validateProduct('p-1')
    expect(api.post).toHaveBeenCalledWith('/products/p-1/validation')
    expect(r.status).toBe('CON_PROBLEMAS')
  })

  it('GET informe devuelve null cuando nunca se validó', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null })
    expect(await fetchValidationReport('p-1')).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/products/p-1/validation')
  })

  it('batch manda la seleccion exacta y devuelve el resumen', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { examined: 2, valid: 1, withErrors: 1, omitted: 0, failed: 0, results: [] } })
    const r = await validateBatch(['a', 'b'])
    expect(api.post).toHaveBeenCalledWith('/products/validation/batch', { productIds: ['a', 'b'] })
    expect(r.examined).toBe(2)
  })
})
