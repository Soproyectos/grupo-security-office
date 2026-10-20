/**
 * IMP-07B (07B) — Utilidades puras de los perfiles de proveedor.
 * La interfaz decide qué mostrar; el servidor revalida siempre las acciones
 * (`providers:read` / `providers:write`).
 */
import { canManageListas, hasPermission } from '../../lib/rbac'
import type { ProviderProfileInput, ProviderRecognition, ResolvedReference } from '../../services/price-import.service'

/** Mismas tarifas que el backend (`PRICE_IMPORT_TARIFFS`), orden canónico. */
export const PROVIDER_TARIFFS = [
  'INSTALADOR_IVA',
  'TIENDA_IVA',
  'ORO_IVA',
  'DPP_PLATINO_IVA',
  'CLIENTE_FINAL_IVA',
] as const

export const PROVIDER_SEPARATORS = ['.', ','] as const
export const PROVIDER_THOUSANDS = ['', '.', ','] as const

/** Ver los perfiles guardados requiere `providers:read` (o la capa legada). */
export function canManageProviderProfiles(): boolean {
  return hasPermission('providers:read') || canManageListas()
}

/** Crear/revisar perfiles de proveedor requiere `providers:write`. */
export function canEditProviderProfiles(): boolean {
  return hasPermission('providers:write') || canManageListas()
}

export interface ProfileFormErrors {
  providerName?: string
  sheet?: string
  headerRow?: string
  separators?: string
  tariffs?: string
  expectedColumns?: string
}

/**
 * Valida el formulario EN EL CLIENTE (misma regla que el servidor) para dar
 * mensajes inmediatos. El servidor sigue siendo la autoridad final.
 */
export function validateProfileForm(input: ProviderProfileInput): ProfileFormErrors {
  const errors: ProfileFormErrors = {}
  if (!input.providerName.trim()) errors.providerName = 'Indica el proveedor.'
  if (!input.sheet.trim()) errors.sheet = 'Indica la hoja del archivo.'
  if (!Number.isInteger(input.headerRow) || input.headerRow < 1 || input.headerRow > 1000) {
    errors.headerRow = 'La fila de encabezado debe estar entre 1 y 1000.'
  }
  if (input.thousandsSeparator !== '' && input.thousandsSeparator === input.decimalSeparator) {
    errors.separators = 'El separador de miles y el decimal no pueden ser el mismo.'
  }
  if (input.tariffs.length === 0) errors.tariffs = 'Selecciona al menos una tarifa.'
  if (input.expectedColumns.filter((c) => c.trim() !== '').length === 0) {
    errors.expectedColumns = 'Registra los encabezados esperados (huella del archivo).'
  }
  return errors
}

export function hasFormErrors(errors: ProfileFormErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Divide una lista separada por comas en encabezados limpios (sin vacíos). */
export function parseHeaders(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

export interface RecognitionMessage {
  tone: 'ok' | 'review'
  message: string
}

/**
 * Mensaje del reconocimiento. Caso 1 (mismo proveedor y misma estructura) →
 * no se pide mapear de nuevo; caso 2 (nuevo o encabezado cambiado) → revisar.
 */
export function recognitionMessage(result: ProviderRecognition): RecognitionMessage {
  if (!result.found) {
    return { tone: 'review', message: `Proveedor «${result.providerName}» sin perfil guardado: hay que mapearlo antes de cargar sus precios.` }
  }
  if (result.matches) {
    return { tone: 'ok', message: `Perfil de «${result.providerName}» v${result.version}: el encabezado coincide, no hay que mapear de nuevo.` }
  }
  return {
    tone: 'review',
    message: `El encabezado de «${result.providerName}» cambió respecto a v${result.version}: revisa el perfil antes de usarlo.`,
  }
}

export interface ResolutionSummary {
  resolved: number
  pending: number
  pendingRefs: string[]
}

/** Cuenta referencias resueltas y pendientes (las ambiguas NO se adivinan). */
export function summarizeResolution(resolution: ResolvedReference[]): ResolutionSummary {
  const pendingRefs = resolution.filter((item) => item.status === 'pending').map((item) => item.externalRef)
  return {
    resolved: resolution.length - pendingRefs.length,
    pending: pendingRefs.length,
    pendingRefs,
  }
}
