import type { Product } from '../types/product.types'

/**
 * Pure model of the "Nuevo producto" wizard. It only decides what to send and what to show; every save goes
 * through the same endpoints and validations as the normal sheet editor.
 */

export const WIZARD_STEPS = [
  { id: 1, label: 'Identidad' },
  { id: 2, label: 'Marca y clasificación' },
  { id: 3, label: 'Contenido y datos técnicos' },
  { id: 4, label: 'Imágenes y recursos' },
  { id: 5, label: 'Resumen y guardado' },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

/** The name length from which the store name may be too long. A warning only: it never blocks or cuts the name. */
export const LONG_NAME_WARNING_FROM = 70

export const LONG_NAME_WARNING = `El nombre tiene ${LONG_NAME_WARNING_FROM} caracteres o más. Se guarda completo, pero en la tienda puede verse cortado.`

/** Step from the `paso` query value. Anything unknown is the first step. */
export function parseWizardStep(raw: string | null | undefined): WizardStepId {
  const value = Number(raw)
  return WIZARD_STEPS.some((step) => step.id === value) ? (value as WizardStepId) : 1
}

/** Steps 2 to 5 work on the saved product: they open once the first save created it. */
export function isStepAvailable(step: WizardStepId, productExists: boolean): boolean {
  return step === 1 || productExists
}

/**
 * Mirror of the server's `normalizeSku` (trim, remove ALL whitespace, upper-case). The server decides the
 * identity with its own helper; this copy only shows the person which reference will be saved.
 */
export function normalizeReference(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase().normalize('NFC')
}

export interface IdentityValues {
  reference: string
  name: string
}

export interface IdentityCheck {
  /** Blocks the save. */
  referenceError: string | null
  /** Informs only. */
  nameWarning: string | null
}

export function checkIdentity({ reference, name }: IdentityValues): IdentityCheck {
  const normalized = normalizeReference(reference)
  return {
    referenceError: normalized.length < 2 ? 'Escribe la referencia del producto (mínimo 2 caracteres).' : null,
    nameWarning: name.length >= LONG_NAME_WARNING_FROM ? LONG_NAME_WARNING : null,
  }
}

/** Body of `POST /products`: the reference alone is enough. A blank name stays pending (the server uses the reference). */
export function buildCreatePayload({ reference, name }: IdentityValues): Record<string, unknown> {
  const payload: Record<string, unknown> = { sku: normalizeReference(reference) }
  if (name.trim() !== '') payload.name = name.trim()
  return payload
}

/** A product whose name equals its reference was created without a name. */
export function isNamePending(product: Pick<Product, 'name' | 'sku'>): boolean {
  return normalizeReference(product.name) === normalizeReference(product.sku)
}

/** What the name field shows for a saved product: empty while the name is pending. */
export function nameForField(product: Pick<Product, 'name' | 'sku'>): string {
  return isNamePending(product) ? '' : product.name
}

export interface DuplicateReference {
  message: string
  /** Set when the server told which product already uses the reference. */
  existingProductId: string | null
}

/** The 409 of `POST /products` for a reference that already exists, or null for any other error. */
export function duplicateReferenceOf(error: unknown): DuplicateReference | null {
  const response = (error as { response?: { status?: number; data?: { code?: unknown; existingProductId?: unknown } } } | null)?.response
  if (response?.status !== 409 || response.data?.code !== 'SKU_EXISTS') return null
  const id = response.data.existingProductId
  return {
    message: 'Ya existe un producto con esa referencia. No se crea otro.',
    existingProductId: typeof id === 'string' && id ? id : null,
  }
}

export interface PendingItem {
  id: 'name' | 'brand' | 'subcategory' | 'description' | 'highlights' | 'images'
  text: string
  step: WizardStepId
}

/**
 * What the saved draft still lacks, in wizard order. Key data is not listed here: the server lists those
 * (MissingKeySpecsPanel). Nothing here blocks saving; it is what review and publication will ask for.
 */
export function pendingItems(product: Pick<Product, 'name' | 'sku' | 'brandId' | 'subcategoryId' | 'description' | 'images'>, hasHighlights: boolean): PendingItem[] {
  const items: PendingItem[] = []
  if (isNamePending(product)) items.push({ id: 'name', text: 'Falta el nombre del producto.', step: 1 })
  if (!product.brandId) items.push({ id: 'brand', text: 'Falta la marca.', step: 2 })
  if (!product.subcategoryId) items.push({ id: 'subcategory', text: 'Falta la subcategoría.', step: 2 })
  if (!product.description?.trim()) items.push({ id: 'description', text: 'Falta la descripción.', step: 3 })
  if (!hasHighlights) items.push({ id: 'highlights', text: 'Faltan destacados para el cliente.', step: 3 })
  if (!product.images?.some((image) => image.url)) items.push({ id: 'images', text: 'Falta al menos una imagen.', step: 4 })
  return items
}

export interface SheetSaveState {
  /** False while the public sheet has not loaded: there is nothing to save it with yet. */
  hasDraft: boolean
  /** Another save moved the sheet to a newer version. */
  conflict: boolean
  /** Fields of the public sheet that fail validation. */
  errorCount: number
}

/**
 * Why a save that returned "not saved" gave no message of its own, in plain words.
 * Null when the sheet already shows its own error (the server rejected it).
 */
export function sheetSaveBlocker({ hasDraft, conflict, errorCount }: SheetSaveState): { message: string; step?: WizardStepId } | null {
  if (!hasDraft) return { message: 'La ficha pública todavía se está cargando. Espera unos segundos y vuelve a pulsar guardar; no se perdió nada de lo escrito.' }
  if (conflict) return { message: 'La ficha cambió mientras la editabas. Recarga la página para ver la versión vigente antes de guardar de nuevo.' }
  if (errorCount > 0) {
    return {
      message: errorCount === 1
        ? 'Hay 1 dato de la ficha por corregir en el paso 3 (marcado en rojo). Corrígelo y vuelve a guardar.'
        : `Hay ${errorCount} datos de la ficha por corregir en el paso 3 (marcados en rojo). Corrígelos y vuelve a guardar.`,
      step: 3,
    }
  }
  return null
}
