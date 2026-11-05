import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ default: { patch: vi.fn() } }))

import api from './api'
import { updateProductImageType } from './product-detail.service'

describe('updateProductImageType', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía el tipo seleccionado y confirma la clasificación devuelta sin cambiar principal', async () => {
    const image = {
      id: 'image-2',
      url: '/api/files/image-2',
      type: 'COMPLEMENTARIA',
      isPrimary: false,
    }
    vi.mocked(api.patch).mockResolvedValue({ data: image } as never)

    await expect(updateProductImageType('image-2', 'COMPLEMENTARIA')).resolves.toEqual(image)

    expect(api.patch).toHaveBeenCalledOnce()
    expect(api.patch).toHaveBeenCalledWith('/products/images/image-2', { type: 'COMPLEMENTARIA' })
    expect(image.isPrimary).toBe(false)
  })

  it('falla si la respuesta no confirma el tipo pedido', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: { id: 'image-2', type: 'PRINCIPAL', isPrimary: false },
    } as never)

    await expect(updateProductImageType('image-2', 'COMPLEMENTARIA'))
      .rejects.toThrow('El servidor no confirmó el tipo de imagen solicitado.')
  })
})
