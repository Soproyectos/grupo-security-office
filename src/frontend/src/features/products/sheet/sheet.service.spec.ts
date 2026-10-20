import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { fetchPublishedImages, saveProductSheet, uploadProductAsset } from './sheet.service'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }))

describe('fetchPublishedImages (CAT-04 frontend-imagenes)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve la galería lensada del detalle público', async () => {
    ;vi.mocked(api.get).mockResolvedValue({ data: { images: [{ src: '/api/files/pub-1', alt: 'Publicada' }] } })
    expect(await fetchPublishedImages('p-1')).toEqual([{ src: '/api/files/pub-1', alt: 'Publicada' }])
    expect(api.get).toHaveBeenCalledWith('/public/products/p-1')
  })

  it('404 (no publicado/invisible) → null: no hay publicada anterior', async () => {
    ;vi.mocked(api.get).mockRejectedValue({ response: { status: 404 } })
    expect(await fetchPublishedImages('p-1')).toBeNull()
  })

  it('sin array de images → lista vacía (público sin fotos)', async () => {
    ;vi.mocked(api.get).mockResolvedValue({ data: {} })
    expect(await fetchPublishedImages('p-1')).toEqual([])
  })

  it('otro error no se traga (sube para el aviso de red)', async () => {
    ;vi.mocked(api.get).mockRejectedValue({ response: { status: 500 } })
    await expect(fetchPublishedImages('p-1')).rejects.toEqual({ response: { status: 500 } })
  })
})

describe('saveProductSheet (CAT-03 OCC viaja en el cuerpo)', () => {
  it('PUT envía el payload tal cual (con expectedVersion si el llamador lo puso)', async () => {
    const payload = { published: false, expectedVersion: 7 } as never
    ;vi.mocked(api.put).mockResolvedValue({ data: { productId: 'p-1', version: 8 } })
    const out = await saveProductSheet('p-1', payload)
    expect(api.put).toHaveBeenCalledWith('/products/p-1/sheet', payload)
    expect(out).toEqual({ productId: 'p-1', version: 8 })
  })
})

describe('uploadProductAsset (CAT-04 D5)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía el archivo como multipart con kind=DOCUMENT y devuelve el registro', async () => {
    const file = new File(['%PDF-1.7 fake'], 'datasheet.pdf', { type: 'application/pdf' })
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { kind: 'DOCUMENT', id: 'f-9', url: '/api/files/f-9', asset: { sizeBytes: 15, sha256: 'x'.repeat(64), detectedKind: 'PDF' } },
    })
    const out = await uploadProductAsset('p-1', 'DOCUMENT', file)
    expect(api.post).toHaveBeenCalledWith('/products/p-1/assets', expect.any(FormData))
    const sent = (vi.mocked(api.post).mock.calls[0] ?? [])[1] as FormData
    expect(sent.get('kind')).toBe('DOCUMENT')
    expect(out).toMatchObject({ id: 'f-9', url: '/api/files/f-9', asset: { detectedKind: 'PDF' } })
  })

  it('un 400 asset-type-mismatch sube al llamador (la UI muestra el motivo del servidor)', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { message: 'El contenido real no es una imagen.', feedback: ['asset-type-mismatch: contenido detectado PDF, declarado image/png'] } },
    })
    const file = new File(['x'], 'malo.pdf', { type: 'image/png' })
    await expect(uploadProductAsset('p-1', 'DOCUMENT', file)).rejects.toMatchObject({ response: { status: 400 } })
  })
})
