/**
 * CAT-06 `frontend` — modelo puro de la publicación. Espejo del contrato de
 * servidor (bandeja §10 del contrato CAT-06): aquí NO se re-definen reglas —
 * solo se presentan los estados que el servidor ya calculó (revisión de trabajo,
 * pin, congelado) y se traduce el 409 del motor a texto legible.
 */

import type { ValidationIssueView } from '../catalog-validation/validation-model'

export type BoardView = 'pendientes' | 'problemas' | 'publicados' | 'historial'

export const BOARD_VIEWS: { id: BoardView; label: string }[] = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'problemas', label: 'Con problemas' },
  { id: 'publicados', label: 'Publicados' },
  { id: 'historial', label: 'Historial' },
]

/** Badge por vista/estado (clases Tailwind del panel). */
export function viewBadge(view: BoardView): { label: string; tone: string } {
  switch (view) {
    case 'problemas':
      return { label: 'con problemas', tone: 'text-red-700' }
    case 'publicados':
      return { label: 'publicado', tone: 'text-emerald-700' }
    case 'historial':
      return { label: 'historial', tone: 'text-neutral-500' }
    default:
      return { label: 'pendiente', tone: 'text-amber-700' }
  }
}

export interface WorkingRevisionInfo {
  id: string
  version: number
  status: string
  rulesVersion: string | null
  validatedAt: string | null
  errorCount: number
  warningCount: number
}

export interface BoardItem {
  id: string
  sku: string
  name: string
  category: string | null
  lifecycleStatus: string
  publishAt: string | null
  scheduledRevisionId: string | null
  publicRevisionId: string | null
  workingRevision: WorkingRevisionInfo | null
}

/**
 * Avisos del ítem: qué verá el scheduler al vencer y si hay pin publicado.
 * Solo describe lo que el servidor afirmó (no inventa comprobaciones).
 */
export function describeBoardItem(item: BoardItem): { schedule: string | null; published: string | null; validation: string | null } {
  const schedule =
    item.publishAt && item.scheduledRevisionId
      ? `Programado para ${new Date(item.publishAt).toLocaleString('es-CO')}: se publicará la revisión congelada v${item.scheduledRevisionId.slice(0, 8)}…, no los cambios posteriores.`
      : item.publishAt
        ? `Programado para ${new Date(item.publishAt).toLocaleString('es-CO')} (sin revisión congelada: se congelará al disparar).`
        : null
  const published = item.publicRevisionId
    ? `En la tienda: revisión ${item.publicRevisionId.slice(0, 8)}…`
    : null
  const rev = item.workingRevision
  const validation = rev
    ? rev.errorCount
      ? `${rev.errorCount} ${rev.errorCount === 1 ? 'error' : 'errores'} de validación (bloquean publicar)`
      : rev.validatedAt
        ? `Validada sin errores (${rev.rulesVersion ?? 'reglas ?'})${rev.warningCount ? ` · ${rev.warningCount} aviso${rev.warningCount > 1 ? 's' : ''}` : ''}`
        : 'Sin validar'
    : 'Sin validar'
  return { schedule, published, validation }
}

/** Acción que la UI ofrece según estado (la autorización real la decide el servidor). */
export function offeredAction(lifecycleStatus: string): 'publicar' | 'retirar' | null {
  if (lifecycleStatus === 'DRAFT') return 'publicar'
  if (lifecycleStatus === 'PUBLISHED') return 'retirar'
  return null
}

/**
 * Traduce el 409 `publication-not-ready` (los `error` viajan en `feedback`,
 * único canal que reenvía el filtro global) a líneas legibles.
 */
export function publicationBlockLines(error: unknown): string[] | null {
  const data = (error as { response?: { status?: number; data?: { message?: unknown; feedback?: unknown } } })?.response?.data
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status !== 409 || !data) return null
  const feedback = Array.isArray(data.feedback) ? data.feedback.filter((f): f is string => typeof f === 'string') : []
  const isPublication = feedback.some((f) => /^[a-z]+\.[a-z_]+ \(/.test(f)) || String(data.message ?? '').includes('Publicación bloqueada')
  if (!isPublication) return null
  return feedback.length ? feedback : [String(data.message ?? 'Publicación bloqueada.')]
}

export interface PublicationEventView {
  action: string
  result: 'ok' | 'blocked' | 'failed' | string
  revisionId: string | null
  actorId: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  PUBLISH: 'Publicación',
  UNPUBLISH: 'Retirada',
  SCHEDULE: 'Programación',
  UNSCHEDULE: 'Cancelación de programación',
  SCHEDULE_PUBLISHED: 'Disparo del scheduler',
  SCHEDULE_BLOCKED: 'Disparo bloqueado',
}

/** Línea del historial: quién/qué revisión/cuándo/resultado — legible, sin revelar ids largos. */
export function describePublicationEvent(ev: PublicationEventView): string {
  const label = ACTION_LABELS[ev.action] ?? ev.action
  const quien = ev.actorId ? `actor ${ev.actorId.slice(0, 8)}…` : 'scheduler'
  const rev = ev.revisionId ? ` · revisión ${ev.revisionId.slice(0, 8)}…` : ''
  return `${label} (${ev.result}) · ${new Date(ev.createdAt).toLocaleString('es-CO')} · ${quien}${rev}`
}

/* ------------------- Pasos para publicar (solo presentación) -------------------
 * Coloca cada requisito que el servidor ya calculó (cat05-r1) en su paso. No
 * define reglas: un código bloqueante desconocido cae en «Revisar y publicar»
 * con el mensaje del servidor, para que nunca quede oculto.
 */

/** Secciones del editor donde se corrige un requisito (ids de LibraryProductEditorPage). */
export type PublishFixSection = 'datos-generales' | 'imagenes' | 'precios' | 'recursos' | 'descripcion'

export type PublishStepId = 'basics' | 'image' | 'price' | 'review'

/** done: completo y plegado · active: primero incompleto y abierto · blocked: espera al paso anterior. */
export type PublishStepStatus = 'done' | 'active' | 'blocked'

export interface PublishStepItem {
  /** Frase corta de lo que falta. */
  text: string
  /** Sección del editor donde se corrige; null si no se corrige en el editor. */
  fixSection: PublishFixSection | null
}

export interface PublishStep {
  id: PublishStepId
  number: number
  title: string
  status: PublishStepStatus
  /** Una línea que se muestra cuando el paso está completo. */
  doneSummary: string
  /** Lo que bloquea el paso; solo el paso activo lo muestra. */
  missing: PublishStepItem[]
  /** Avisos que no impiden publicar; solo aparecen en «Revisar y publicar». */
  notices: string[]
}

export interface PublishStepContext {
  /** none: nunca comprobada · unavailable: no se pudo cargar · stale: obsoleta tras editar · current: vigente. */
  check: 'none' | 'unavailable' | 'stale' | 'current'
  /** Cambios de la ficha sin guardar. */
  unsavedChanges: boolean
  /** Hay un cambio de precios en curso. */
  pricesPending: boolean
}

const PUBLISH_STEP_ORDER: { id: PublishStepId; title: string; doneSummary: string }[] = [
  { id: 'basics', title: 'Datos básicos', doneSummary: 'Nombre, categoría y marca listos.' },
  { id: 'image', title: 'Imagen principal', doneSummary: 'Imagen principal lista.' },
  { id: 'price', title: 'Precio vigente', doneSummary: 'Precio vigente listo.' },
  { id: 'review', title: 'Revisar y publicar', doneSummary: '' },
]

export const PUBLISH_STEP_COUNT = PUBLISH_STEP_ORDER.length

/** Código bloqueante del motor → paso que lo resuelve. */
const STEP_BY_CODE: Partial<Record<string, PublishStepId>> = {
  'base.name_useful': 'basics',
  'base.category_valid': 'basics',
  'base.brand_present': 'basics',
  'media.primary_image': 'image',
  'offer.price_valid': 'price',
  'media.file_exists': 'review',
}

/** Texto y corrección de cada código bloqueante conocido. */
const ITEM_TEXT: Partial<Record<string, PublishStepItem>> = {
  'base.name_useful': { text: 'Falta escribir un nombre útil.', fixSection: 'datos-generales' },
  'base.category_valid': { text: 'Falta elegir una categoría activa.', fixSection: 'datos-generales' },
  'base.brand_present': { text: 'Falta elegir la marca.', fixSection: 'datos-generales' },
  'media.primary_image': { text: 'Falta una imagen principal.', fixSection: 'imagenes' },
  'offer.price_valid': { text: 'Falta un precio vigente y positivo.', fixSection: 'precios' },
}

/** Sección del motor → sección del editor, para códigos bloqueantes sin texto propio. */
const SECTION_FIX: Partial<Record<string, PublishFixSection>> = {
  identidad: 'datos-generales',
  general: 'datos-generales',
  multimedia: 'imagenes',
  documentos: 'recursos',
  oferta: 'precios',
  atributos: 'descripcion',
}

/** Avisos del motor que no bloquean publicar. */
const NOTICE_TEXT: Partial<Record<string, string>> = {
  'docs.datasheet_missing': 'Falta la ficha técnica en PDF.',
  'media.external_unverified': 'Una imagen usa un enlace externo que no se puede verificar.',
  'stock.zero_info': 'No hay stock: la tienda mostrará «Agotado».',
}

const CHECK_TEXT: Record<Exclude<PublishStepContext['check'], 'current'>, string> = {
  none: 'Todavía no se ha comprobado la ficha. Usa «Validar ficha» para ver qué falta.',
  stale: 'La comprobación quedó desactualizada tras una edición. Usa «Volver a validar» para ver qué falta.',
  unavailable: 'No se pudo cargar qué falta. Recarga la página para intentarlo de nuevo.',
}

function itemFor(issue: ValidationIssueView): PublishStepItem {
  if (issue.code === 'media.file_exists') {
    const fixSection: PublishFixSection | null = issue.field === 'images' ? 'imagenes' : issue.field === 'resources' ? 'recursos' : null
    return { text: 'Un archivo no está en el almacén o no es del tipo esperado. Vuelve a subirlo o corrige su dirección.', fixSection }
  }
  const known = ITEM_TEXT[issue.code]
  if (known) return { ...known }
  return { text: issue.message, fixSection: SECTION_FIX[issue.section] ?? null }
}

/**
 * Pasos de publicación a partir de los requisitos del servidor. El paso activo es
 * el primero con algo pendiente (o «Revisar y publicar» si todo lo demás está listo);
 * los anteriores quedan completos y los siguientes, bloqueados.
 */
export function buildPublishSteps(requirements: readonly ValidationIssueView[], context: PublishStepContext): PublishStep[] {
  const missing: Record<PublishStepId, PublishStepItem[]> = { basics: [], image: [], price: [], review: [] }
  const notices: string[] = []

  if (context.check === 'current') {
    for (const issue of requirements) {
      if (issue.severity === 'error') {
        missing[STEP_BY_CODE[issue.code] ?? 'review'].push(itemFor(issue))
      } else {
        notices.push(NOTICE_TEXT[issue.code] ?? issue.message)
      }
    }
  } else {
    missing.basics.push({ text: CHECK_TEXT[context.check], fixSection: null })
  }
  if (context.unsavedChanges) missing.review.push({ text: 'Hay cambios sin guardar en la ficha.', fixSection: null })
  if (context.pricesPending) missing.review.push({ text: 'Hay un cambio de precios en curso.', fixSection: null })

  const firstIncomplete = PUBLISH_STEP_ORDER.findIndex((step) => missing[step.id].length > 0)
  const activeIndex = firstIncomplete === -1 ? PUBLISH_STEP_ORDER.length - 1 : firstIncomplete

  return PUBLISH_STEP_ORDER.map((step, index) => ({
    id: step.id,
    number: index + 1,
    title: step.title,
    status: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'blocked',
    doneSummary: step.doneSummary,
    missing: missing[step.id],
    notices: step.id === 'review' ? notices : [],
  }))
}
