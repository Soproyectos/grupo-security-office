import { describe, expect, it } from 'vitest'
import {
  AUTHORIZED_DOWNLOAD_NOTICE,
  FIRMWARE_UPLOAD_DEFERRED_HINT,
  PDF_OPTIONAL_NOTICE,
  toUploadResult,
  uploadHintFor,
} from './document-assets'

describe('document-assets (CAT-04 frontend-documentos)', () => {
  it('el aviso de descarga autorizada explica el efecto PRIVADO (espejo del backend D4)', () => {
    expect(AUTHORIZED_DOWNLOAD_NOTICE).toContain('PRIVADO')
    expect(AUTHORIZED_DOWNLOAD_NOTICE).toContain('acceso al producto')
  })

  it('la ficha técnica (PDF) es opcional y no bloquea publicar (regla 4)', () => {
    expect(PDF_OPTIONAL_NOTICE).toContain('opcional')
    expect(PDF_OPTIONAL_NOTICE).toContain('no se bloquea')
  })

  it('solo la sección firmware muestra el hint de subida diferida (E1, diseño :267)', () => {
    expect(uploadHintFor('firmware')).toBe(FIRMWARE_UPLOAD_DEFERRED_HINT)
    expect(uploadHintFor('documents')).toBeNull()
    expect(FIRMWARE_UPLOAD_DEFERRED_HINT).toContain('diferida')
    expect(FIRMWARE_UPLOAD_DEFERRED_HINT).toContain('inventario de formatos')
  })

  it('toUploadResult exige id y url (respuesta incompleta → error visible, no url vacía)', () => {
    expect(toUploadResult({ id: 'f-1', url: '/api/files/f-1' })).toEqual({ id: 'f-1', url: '/api/files/f-1' })
    expect(() => toUploadResult({ id: 'f-1' })).toThrow(/incompleta/)
    expect(() => toUploadResult(null)).toThrow(/incompleta/)
  })
})
