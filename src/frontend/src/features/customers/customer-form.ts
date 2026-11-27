import type {
  Customer,
  CustomerPayload,
  CustomerSource,
  CustomerStatus,
} from './types/customer.types'

/**
 * Estado y payload del formulario de cliente (COM-02 frontend).
 *
 * El payload se construye AQUÍ (función pura, testeable) en vez de dentro del
 * modal: así el modo `edit` no puede colar `status`, `ownerId` ni `isActive`
 * —el PATCH general del servidor los rechaza con 400 desde este incremento
 * (COM-02 §11 «riesgo de transición»). El modo `create` sí conserva
 * `status`: `CreateCustomerDto` lo admite.
 */
export interface CustomerFormState {
  name: string
  documentType: string
  documentId: string
  email: string
  phone: string
  city: string
  address: string
  status: CustomerStatus
  source: '' | CustomerSource
  sourceDetail: string
  notes: string
}

/** Document types offered by the form; NIT is the default for companies. */
export const DEFAULT_DOCUMENT_TYPE = 'NIT'
export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'NIT', label: 'NIT' },
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PA', label: 'Pasaporte' },
] as const

/** Document types for the select: the fixed list plus an old value that is not in it. */
export function documentTypeOptions(current: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = DOCUMENT_TYPE_OPTIONS.map((o) => ({ ...o }))
  if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current })
  if (!current) options.unshift({ value: '', label: 'Sin tipo' })
  return options
}

/** DIAN weights, applied from the rightmost digit of the NIT base to the left. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const

/**
 * Check digit (DV) of a NIT base number. Dots and spaces are ignored; anything
 * that is not a plain digit string of 1 to 15 digits (a hyphen included) gives
 * null. Same algorithm as the backend.
 */
export function computeNitDv(base: string): number | null {
  const digits = base.replace(/[.\s]/g, '')
  if (!/^\d+$/.test(digits) || digits.length > NIT_WEIGHTS.length) return null
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[digits.length - 1 - i]) * (NIT_WEIGHTS[i] ?? 0)
  }
  const remainder = sum % 11
  return remainder > 1 ? 11 - remainder : remainder
}

export interface ParsedNitInput {
  /** Digits of the NIT without dots, spaces or check digit. */
  base: string
  /** Check digit the person wrote, or null when they wrote none. */
  enteredDv: number | null
}

/**
 * Reads what the person typed in the NIT field (same rules as the backend):
 * - a final hyphen plus one digit is a written check digit ("901.123.456-7");
 * - with no hyphen, ten digits whose last digit matches the check digit
 *   calculated from the first nine are a NIT with its check digit;
 * - any other digit string is a base without check digit.
 * Returns null for empty or non-numeric text.
 */
export function parseNitInput(raw: string): ParsedNitInput | null {
  const cleaned = raw.replace(/[.\s]/g, '')
  const withHyphen = /^(\d+)-(\d)$/.exec(cleaned)
  if (withHyphen) return { base: withHyphen[1] ?? '', enteredDv: Number(withHyphen[2]) }
  if (!/^\d+$/.test(cleaned)) return null
  if (cleaned.length === 10) {
    const head = cleaned.slice(0, 9)
    if (computeNitDv(head) === Number(cleaned[9])) return { base: head, enteredDv: Number(cleaned[9]) }
  }
  return { base: cleaned, enteredDv: null }
}

/** "901123456" and 7 give "901.123.456-7"; without a check digit only the dots are added. */
export function formatNit(base: string, dv?: number | null): string {
  const dotted = base.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return typeof dv === 'number' ? `${dotted}-${dv}` : dotted
}

/** Document of a customer for lists and details; a NIT shows dots and its check digit when known. */
export function formatCustomerDocument(
  customer: Pick<Customer, 'documentType' | 'documentId' | 'documentDv'>,
): string {
  const { documentType, documentId, documentDv } = customer
  if (!documentId) return '-'
  const prefix = documentType ? `${documentType} ` : ''
  if (documentType === 'NIT' && typeof documentDv === 'number' && /^\d+$/.test(documentId)) {
    return `${prefix}${formatNit(documentId, documentDv)}`
  }
  return `${prefix}${documentId}`
}

/** A DIVIPOLA municipality code (five digits), the format the web registration stores. */
export function isMunicipalityCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{5}$/.test(value.trim())
}

/**
 * Free-text city of an old customer (not a DIVIPOLA code). It is shown as-is
 * and never sent back, so the customer can be edited without changing it.
 */
export function legacyCityOf(customer: Pick<Customer, 'city'> | null | undefined): string {
  const city = customer?.city?.trim() ?? ''
  return city && !isMunicipalityCode(city) ? city : ''
}

export const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  name: '',
  documentType: DEFAULT_DOCUMENT_TYPE,
  documentId: '',
  email: '',
  phone: '',
  city: '',
  address: '',
  status: 'LEAD',
  source: '',
  sourceDetail: '',
  notes: '',
}

export function toCustomerFormState(customer: Customer | null | undefined): CustomerFormState {
  if (!customer) return EMPTY_CUSTOMER_FORM
  return {
    name: customer.name,
    documentType: customer.documentType ?? '',
    documentId: customer.documentId ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    city: customer.city ?? '',
    address: customer.address ?? '',
    status: customer.status,
    source: customer.source ?? '',
    sourceDetail: customer.sourceDetail ?? '',
    notes: customer.notes ?? '',
  }
}

type CustomerFormMode = 'create' | 'edit'

const trimmed = (value: string) => value.trim() || undefined

/** Quita las claves `undefined`: no deben viajar en el body. */
function withoutUndefined<T extends object>(payload: T): T {
  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key]
  }
  return payload
}

/**
 * Body del POST (modo `create`) o del PATCH general (modo `edit`).
 * `status` SOLO se envía al crear; en edición ni siquiera se construye.
 */
export function buildCustomerPayload(
  form: CustomerFormState,
  mode: CustomerFormMode,
  legacyCity = ''
): CustomerPayload {
  const documentId = trimmed(form.documentId)
  // The server only accepts a DIVIPOLA code; an untouched free-text city of an
  // old customer is left out so the PATCH keeps it as it was.
  const city = trimmed(form.city)
  const cityIsUntouchedLegacy = Boolean(legacyCity) && city === legacyCity
  const payload: Partial<CustomerPayload> & Pick<CustomerPayload, 'name'> = {
    name: form.name.trim(),
    // A type without a number says nothing, so it is only sent with the number.
    documentType: documentId ? trimmed(form.documentType) : undefined,
    documentId,
    email: trimmed(form.email),
    phone: trimmed(form.phone),
    city: cityIsUntouchedLegacy ? undefined : city,
    address: trimmed(form.address),
    source: form.source || undefined,
    sourceDetail: trimmed(form.sourceDetail),
    notes: trimmed(form.notes),
  }

  if (mode === 'create') payload.status = form.status

  return withoutUndefined(payload)
}
