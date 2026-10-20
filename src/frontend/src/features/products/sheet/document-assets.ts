/**
 * CAT-04 `frontend-documentos` — textos y reglas presentacionales de los
 * documentos/firmware de la ficha. Puro y espejo del backend (§11): nada que
 * inventar — la verificación de tipo real, el privado con licencia y el
 * firmware diferido los aplica el servidor.
 */
import type { ResourceSection } from './sheet-form'

/** Aviso que pinta el editor cuando un recurso exige licencia/autorización. */
export const AUTHORIZED_DOWNLOAD_NOTICE =
  'Este archivo queda PRIVADO en el almacén: solo podrán descargarlo, con su sesión, quienes tengan acceso al producto (la tienda no lo lista abierto).'

/** La ficha técnica nunca es obligatoria para publicar (regla 4 / CAT-03 §14). */
export const PDF_OPTIONAL_NOTICE = 'La ficha técnica (PDF) es opcional: publicar no se bloquea si falta.'

/** Firmware NO se sube por aquí aún — diseño :267 (insumo externo E1). */
export const FIRMWARE_UPLOAD_DEFERRED_HINT =
  'La subida directa de firmware está diferida: requiere inventario de formatos, lista permitida, tamaño máximo y revisión de seguridad. Pega la URL del archivo mientras tanto.'

export function uploadHintFor(section: ResourceSection): string | null {
  return section === 'firmware' ? FIRMWARE_UPLOAD_DEFERRED_HINT : null
}

export interface UploadResult {
  id: string
  url: string
}

/** Resultado de `POST /products/:id/assets` (DOCUMENT) reducido para el editor. */
export function toUploadResult(response: unknown): UploadResult {
  const r = response as { id?: string; url?: string }
  if (!r?.id || !r?.url) throw new Error('respuesta de subida incompleta')
  return { id: r.id, url: r.url }
}
