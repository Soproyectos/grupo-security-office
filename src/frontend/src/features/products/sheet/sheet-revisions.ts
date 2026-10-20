/**
 * CAT-03 `frontend-beneficios` — estado de VALIDACIÓN de la ficha a partir del
 * resumen de revisiones del servidor (GET /products/:id/revisions, CAT-02).
 * Regla 5 del contrato: **editar deja la validación pendiente; no la autoriza**.
 * Aquí solo se LEE el estado: validar/publicar pertenece a CAT-05/CAT-06.
 */

export type RevisionStatus = 'SIN_REVISAR' | 'CON_PROBLEMAS' | 'LISTA_PARA_PUBLICAR' | 'REVISION_PENDIENTE' | 'PUBLICADA'

/** Fila de `GET /products/:id/revisions` (sin `content`). */
export interface RevisionSummaryApi {
  id: string
  version: number
  status: RevisionStatus
  notes: string | null
  publishedAt: string | null
  createdAt: string
}

export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  SIN_REVISAR: 'sin revisar',
  CON_PROBLEMAS: 'con problemas',
  LISTA_PARA_PUBLICAR: 'lista para publicar',
  REVISION_PENDIENTE: 'revisión pendiente',
  PUBLICADA: 'publicada',
}

export interface ValidationState {
  status: RevisionStatus | null
  label: string
  /** true cuando hay cambios guardados que aún no pasaron por validación. */
  pending: boolean
}

/**
 * Estado a partir del resumen del servidor (ya ordenado por versión desc).
 * Sin revisiones ⇒ «sin revisiones» (el producto nunca pasó por el flujo).
 */
export function latestValidation(revisions: RevisionSummaryApi[] | undefined): ValidationState {
  const latest = revisions?.[0]
  if (!latest) return { status: null, label: 'sin revisiones', pending: false }
  return {
    status: latest.status,
    label: REVISION_STATUS_LABELS[latest.status] ?? latest.status,
    pending: latest.status === 'REVISION_PENDIENTE',
  }
}

/** Aviso que pinta el editor cuando la validación quedó pendiente (regla 5). */
export const PENDING_VALIDATION_NOTICE =
  'La validación quedó en «revisión pendiente»: la tienda sigue mostrando la última versión publicada hasta que se valide y publique.'
