import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'
import { createCategory } from './settings.service'

vi.mock('./api', () => ({ default: { post: vi.fn() } }))

describe('createCategory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía parentId al crear una subcategoría', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'child-1', parentId: 'root-1' } })
    const payload = { name: 'Cámaras IP', slug: 'camaras-ip', parentId: 'root-1' }

    await createCategory(payload)

    expect(api.post).toHaveBeenCalledWith('/categories', payload)
  })
})
