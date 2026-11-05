import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import {
  approveMoldEntry,
  createSubcategory,
  deleteSubcategory,
  fetchBrandUsage,
  fetchCategoryUsage,
  fetchMoldUsage,
  fetchPriceListUsage,
  fetchSpecDefinitionUsage,
  fetchSpecDefinitions,
  fetchSubcategories,
  fetchSubcategoryUsage,
  setCategoryActive,
  setSubcategoryActive,
  updateCategoryWithImpact,
  updatePriceListWithImpact,
  updateSpecDefinition,
  updateSubcategory,
} from './masters-api'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

describe('masters api clients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    vi.mocked(api.patch).mockResolvedValue({ data: {} })
    vi.mocked(api.delete).mockResolvedValue({ data: {} })
  })

  it('subcategory CRUD hits the new endpoints', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 's1' }] } })
    expect(await fetchSubcategories({ q: 'dom' })).toEqual([{ id: 's1' }])
    expect(api.get).toHaveBeenCalledWith('/subcategories', { params: { q: 'dom', pageSize: 200 } })
    await createSubcategory({ categoryId: 'c', name: 'Domos' })
    expect(api.post).toHaveBeenCalledWith('/subcategories', { categoryId: 'c', name: 'Domos' })
    await updateSubcategory('s/1', { name: 'X', categoryId: 'c2', confirmImpact: true })
    expect(api.put).toHaveBeenCalledWith('/subcategories/s%2F1', { name: 'X', categoryId: 'c2', confirmImpact: true })
    await setSubcategoryActive('s1', false)
    expect(api.patch).toHaveBeenCalledWith('/subcategories/s1/active', { isActive: false })
    await deleteSubcategory('s1')
    expect(api.delete).toHaveBeenCalledWith('/subcategories/s1')
    await fetchSubcategoryUsage('s1')
    expect(api.get).toHaveBeenCalledWith('/subcategories/s1/usage')
  })

  it('usage and activation endpoints of categories, brands and tariffs', async () => {
    await fetchCategoryUsage('c1')
    await fetchBrandUsage('b1')
    await fetchPriceListUsage('p1')
    expect(vi.mocked(api.get).mock.calls.map((call) => call[0])).toEqual(['/categories/c1/usage', '/brands/b1/usage', '/prices/lists/p1/usage'])
    await setCategoryActive('c1', true)
    expect(api.patch).toHaveBeenCalledWith('/categories/c1/active', { isActive: true })
  })

  it('sends confirmImpact only when confirmed', async () => {
    await updateCategoryWithImpact('c1', { parentId: 'c2' }, false)
    expect(api.put).toHaveBeenLastCalledWith('/categories/c1', { parentId: 'c2' })
    await updateCategoryWithImpact('c1', { parentId: 'c2' }, true)
    expect(api.put).toHaveBeenLastCalledWith('/categories/c1', { parentId: 'c2', confirmImpact: true })
    await updatePriceListWithImpact('p1', { currency: 'USD' }, true)
    expect(api.put).toHaveBeenLastCalledWith('/prices/lists/p1', { currency: 'USD', confirmImpact: true })
  })

  it('dictionary and mold endpoints', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [{ key: 'a' }] })
    expect(await fetchSpecDefinitions('res')).toEqual([{ key: 'a' }])
    expect(api.get).toHaveBeenCalledWith('/library/spec-definitions', { params: { includeInactive: 'true', q: 'res' } })
    await fetchSpecDefinitionUsage('res')
    await fetchMoldUsage('s1')
    expect(api.get).toHaveBeenCalledWith('/library/spec-definitions/res/usage')
    expect(api.get).toHaveBeenCalledWith('/library/subcategories/s1/spec-template/usage')
    await updateSpecDefinition('res', { label: 'Resolución', confirmImpact: true })
    expect(api.patch).toHaveBeenCalledWith('/library/spec-definitions/res', { label: 'Resolución', confirmImpact: true })
    await approveMoldEntry('s1', 'res', 'ok')
    expect(api.post).toHaveBeenCalledWith('/library/subcategories/s1/spec-template/res/approve', { reason: 'ok' })
  })
})
