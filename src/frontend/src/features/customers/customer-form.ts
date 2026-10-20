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

export const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  name: '',
  documentType: '',
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
  mode: CustomerFormMode
): CustomerPayload {
  const payload: Partial<CustomerPayload> & Pick<CustomerPayload, 'name'> = {
    name: form.name.trim(),
    documentType: trimmed(form.documentType),
    documentId: trimmed(form.documentId),
    email: trimmed(form.email),
    phone: trimmed(form.phone),
    city: trimmed(form.city),
    address: trimmed(form.address),
    source: form.source || undefined,
    sourceDetail: trimmed(form.sourceDetail),
    notes: trimmed(form.notes),
  }

  if (mode === 'create') payload.status = form.status

  return withoutUndefined(payload)
}
