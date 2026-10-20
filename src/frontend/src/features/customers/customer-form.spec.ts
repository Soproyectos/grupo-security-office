import { describe, expect, it } from 'vitest'
import {
  EMPTY_CUSTOMER_FORM,
  buildCustomerPayload,
  toCustomerFormState,
  type CustomerFormState,
} from './customer-form'
import type { Customer } from './types/customer.types'

/**
 * COM-02 frontend — formulario de cliente (aceptación 1, lado cliente).
 *
 * ✅ La edición general NO incluye `status` en el payload: el PATCH del
 *    servidor rechaza 400 `status-not-allowed-in-general-edit` desde este
 *    incremento (COM-02 §11 «riesgo de transición»). La creación sí lo
 *    conserva: `CreateCustomerDto` sigue admitiéndolo.
 * ✅ Tampoco aparecen `ownerId`/`isActive` en ningún modo (la reasignación
 *    vive en su endpoint y la baja en DELETE).
 * ✅ En edición el campo «Estado» se retira del form (nota informativa) —
 *    F1 sigue pendiente, así que la UI no promete cambiar estado.
 */

const CUSTOMER: Customer = {
  id: 'c-1',
  code: 'CL-0003',
  name: 'Cliente Spot COM02',
  documentType: 'NIT',
  documentId: '901123456-7',
  email: 'spot@fixture.test',
  phone: '+57 300 000 0000',
  city: 'Bogotá',
  address: 'Cra 7 # 123-45',
  status: 'LEAD',
  source: 'REFERIDO',
  sourceDetail: 'feria',
  ownerId: 'owner-admin',
  createdById: 'owner-admin',
  convertedAt: null,
  lastContactAt: null,
  notes: 'nota interna',
  isActive: true,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
}

const FILLED: CustomerFormState = {
  name: 'Cliente Spot COM02',
  documentType: 'NIT',
  documentId: '901123456-7',
  email: 'spot@fixture.test',
  phone: '+57 300 000 0000',
  city: 'Bogotá',
  address: 'Cra 7 # 123-45',
  status: 'CLIENTE',
  source: 'REFERIDO',
  sourceDetail: 'feria',
  notes: 'nota interna',
}

describe('buildCustomerPayload — ACEPTACIÓN 1 (payload de edición sin ownerId/status)', () => {
  it('modo edit no envía status, ownerId ni isActive', () => {
    const payload = buildCustomerPayload(FILLED, 'edit')

    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('ownerId')
    expect(payload).not.toHaveProperty('isActive')
    expect(payload.name).toBe('Cliente Spot COM02')
    expect(payload.notes).toBe('nota interna')
  })

  it('modo create SÍ conserva el estado (el POST del servidor lo admite)', () => {
    const payload = buildCustomerPayload(FILLED, 'create')

    expect(payload.status).toBe('CLIENTE')
    expect(payload).not.toHaveProperty('ownerId')
    expect(payload).not.toHaveProperty('isActive')
  })

  it('trimea y convierte vacíos en undefined para no mandar strings en blanco', () => {
    const payload = buildCustomerPayload(
      { ...EMPTY_CUSTOMER_FORM, name: '  Cliente  ', email: '   ', city: 'Medellín' },
      'edit',
    )

    expect(payload.name).toBe('Cliente')
    expect(payload).not.toHaveProperty('email')
    expect(payload.city).toBe('Medellín')
  })
})

describe('toCustomerFormState', () => {
  it('carga los datos del cliente en el formulario', () => {
    expect(toCustomerFormState(CUSTOMER)).toEqual({
      name: 'Cliente Spot COM02',
      documentType: 'NIT',
      documentId: '901123456-7',
      email: 'spot@fixture.test',
      phone: '+57 300 000 0000',
      city: 'Bogotá',
      address: 'Cra 7 # 123-45',
      status: 'LEAD',
      source: 'REFERIDO',
      sourceDetail: 'feria',
      notes: 'nota interna',
    })
  })

  it('sin cliente devuelve el formulario vacío con estado LEAD por defecto', () => {
    expect(toCustomerFormState(null)).toEqual(EMPTY_CUSTOMER_FORM)
    expect(EMPTY_CUSTOMER_FORM.status).toBe('LEAD')
  })

  it('campos nulos del cliente se cargan como cadena vacía', () => {
    const form = toCustomerFormState({ ...CUSTOMER, email: null, city: null, notes: null })

    expect(form.email).toBe('')
    expect(form.city).toBe('')
    expect(form.notes).toBe('')
  })
})
