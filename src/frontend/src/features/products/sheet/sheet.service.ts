import api from '../../../services/api'
import type { ProductSheetApi, ProductSheetPayload } from './sheet-form'
import type { RevisionSummaryApi } from './sheet-revisions'
import type { PublishedImageRef } from './published-images'

export const sheetKeys = {
  detail: (productId: string) => ['product-sheet', productId] as const,
  revisions: (productId: string) => ['product-revisions', productId] as const,
}

/** GET /products/:id/sheet: the editable public sheet of a product. */
export async function fetchProductSheet(productId: string): Promise<ProductSheetApi> {
  const res = await api.get(`/products/${productId}/sheet`)
  return res.data as ProductSheetApi
}

/** PUT /products/:id/sheet: replaces the whole sheet in one transaction. */
export async function saveProductSheet(productId: string, payload: ProductSheetPayload): Promise<ProductSheetApi> {
  const res = await api.put(`/products/${productId}/sheet`, payload)
  return res.data as ProductSheetApi
}

// ------------------------------ Internal notes ------------------------------

/** One internal note as returned by `GET /products/:id/internal-notes`. */
export interface InternalNoteApi {
  id: string
  text: string
  authorName: string
  createdAt: string
  /** Null until the note is edited at least once. */
  updatedAt: string | null
  /** Computed by the server: true only for the author. */
  canEdit: boolean
  /** Optimistic-concurrency counter, sent back as `expectedVersion`. */
  version: number
}

export const internalNoteKeys = {
  list: (productId: string) => ['product-internal-notes', productId] as const,
}

/** GET /products/:id/internal-notes: all notes, newest first. */
export async function fetchInternalNotes(productId: string): Promise<InternalNoteApi[]> {
  const res = await api.get(`/products/${productId}/internal-notes`)
  return res.data as InternalNoteApi[]
}

/** POST /products/:id/internal-notes: writes a new note authored by the session user. */
export async function createInternalNote(productId: string, text: string): Promise<InternalNoteApi> {
  const res = await api.post(`/products/${productId}/internal-notes`, { text })
  return res.data as InternalNoteApi
}

/** PATCH /products/:id/internal-notes/:noteId: only the author may edit; 409 on stale version. */
export async function updateInternalNote(productId: string, noteId: string, text: string, expectedVersion?: number): Promise<InternalNoteApi> {
  const res = await api.patch(`/products/${productId}/internal-notes/${noteId}`, {
    text,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  })
  return res.data as InternalNoteApi
}

/**
 * CAT-03 (regla 5): resumen de revisiones para mostrar el estado de validación.
 * Solo lectura: validar/publicar es CAT-05/CAT-06.
 */
export async function fetchProductRevisions(productId: string): Promise<RevisionSummaryApi[]> {
  const res = await api.get(`/products/${productId}/revisions`)
  return res.data as RevisionSummaryApi[]
}

/**
 * CAT-04 (frontend-imagenes): lo que la TIENDA muestra hoy — la galería del
 * detalle público, que ya viene filtrada por el lente de la revisión publicada.
 * 404 (no publicado/invisible) → null: no hay «publicada anterior» que comparar.
 */
export async function fetchPublishedImages(productId: string): Promise<PublishedImageRef[] | null> {
  try {
    const res = await api.get(`/public/products/${productId}`)
    const dto = res.data as { images?: PublishedImageRef[] }
    return Array.isArray(dto?.images) ? dto.images : []
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404) return null
    throw error
  }
}

/**
 * CAT-04 (D5): sube un activo verificado (DOCUMENT = PDF u imagen real; el
 * servidor comprueba el contenido por firma mágica y devuelve el registro).
 * FIRMWARE se rechaza en el servidor con motivo (alcance diferido E1) — la UI
 * no ofrece la opción.
 */
export async function uploadProductAsset(productId: string, kind: 'DOCUMENT', file: File): Promise<{ id: string; url: string; asset?: { sizeBytes: number; sha256: string; detectedKind: string } }> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind)
  const res = await api.post(`/products/${productId}/assets`, fd)
  return res.data as { id: string; url: string; asset?: { sizeBytes: number; sha256: string; detectedKind: string } }
}
