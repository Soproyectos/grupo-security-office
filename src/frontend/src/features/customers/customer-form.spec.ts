import { describe, expect, it } from 'vitest'
import {
  EMPTY_CUSTOMER_FORM,
  buildCustomerPayload,
  computeNitDv,
  documentTypeOptions,
  formatCustomerDocument,
  formatNit,
  isMunicipalityCode,
  legacyCityOf,
  parseNitInput,
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

describe('ciudad DIVIPOLA y documento', () => {
  it('reconoce el código de cinco dígitos y el texto antiguo', () => {
    expect(isMunicipalityCode('05001')).toBe(true)
    expect(isMunicipalityCode('Bogotá')).toBe(false)
    expect(legacyCityOf({ city: 'Bogotá' })).toBe('Bogotá')
    expect(legacyCityOf({ city: '05001' })).toBe('')
    expect(legacyCityOf(null)).toBe('')
  })

  it('envía el código elegido en la ciudad', () => {
    expect(buildCustomerPayload({ ...FILLED, city: '66001' }, 'create').city).toBe('66001')
  })

  it('no reenvía la ciudad antigua de texto libre si no se cambió', () => {
    expect(buildCustomerPayload(FILLED, 'edit', 'Bogotá')).not.toHaveProperty('city')
    expect(buildCustomerPayload({ ...FILLED, city: '66001' }, 'edit', 'Bogotá').city).toBe('66001')
  })

  it('un cliente nuevo parte con tipo NIT y el tipo solo viaja junto al número', () => {
    expect(EMPTY_CUSTOMER_FORM.documentType).toBe('NIT')
    expect(buildCustomerPayload({ ...EMPTY_CUSTOMER_FORM, name: 'Cliente' }, 'create')).not.toHaveProperty('documentType')
    expect(buildCustomerPayload({ ...EMPTY_CUSTOMER_FORM, name: 'Cliente', documentId: '901' }, 'create').documentType).toBe('NIT')
  })

  it('conserva en la lista un tipo antiguo que no está entre los ofrecidos', () => {
    expect(documentTypeOptions('RUT').map((o) => o.value)).toContain('RUT')
    expect(documentTypeOptions('')[0]?.value).toBe('')
  })
})

describe('computeNitDv', () => {
  it('calculates the DIAN check digit (800197268 gives 4)', () => {
    expect(computeNitDv('800197268')).toBe(4)
  })

  it('ignores dots and spaces', () => {
    expect(computeNitDv('800.197.268')).toBe(4)
    expect(computeNitDv(' 800 197 268 ')).toBe(4)
  })

  it('always gives a single digit', () => {
    expect(computeNitDv('901123456')).toBe(1)
    for (const base of ['1', '12', '123456789', '900123456']) {
      const dv = computeNitDv(base)
      expect(dv).not.toBeNull()
      expect(dv as number).toBeGreaterThanOrEqual(0)
      expect(dv as number).toBeLessThanOrEqual(9)
    }
  })

  it('returns null for text that is not a base number', () => {
    expect(computeNitDv('')).toBeNull()
    expect(computeNitDv('800197268-4')).toBeNull()
    expect(computeNitDv('abc')).toBeNull()
    expect(computeNitDv('1'.repeat(16))).toBeNull()
  })
})

describe('parseNitInput', () => {
  it('reads a written check digit after a hyphen, with or without dots', () => {
    expect(parseNitInput('901.123.456-7')).toEqual({ base: '901123456', enteredDv: 7 })
    expect(parseNitInput('800197268-4')).toEqual({ base: '800197268', enteredDv: 4 })
  })

  it('reads a NIT with no check digit', () => {
    expect(parseNitInput('800197268')).toEqual({ base: '800197268', enteredDv: null })
    expect(parseNitInput(' 800.197.268 ')).toEqual({ base: '800197268', enteredDv: null })
  })

  it('treats ten digits whose last digit matches the calculated one as a NIT with check digit', () => {
    expect(parseNitInput('8001972684')).toEqual({ base: '800197268', enteredDv: 4 })
  })

  it('treats ten digits whose last digit does not match as a base without check digit', () => {
    expect(parseNitInput('8001972685')).toEqual({ base: '8001972685', enteredDv: null })
  })

  it('returns null for empty or non numeric text', () => {
    expect(parseNitInput('')).toBeNull()
    expect(parseNitInput('  ')).toBeNull()
    expect(parseNitInput('ABC-1')).toBeNull()
    expect(parseNitInput('901-123-456-7')).toBeNull()
  })
})

describe('formatNit / formatCustomerDocument', () => {
  it('adds dots and the check digit', () => {
    expect(formatNit('901123456', 1)).toBe('901.123.456-1')
    expect(formatNit('800197268', 0)).toBe('800.197.268-0')
    expect(formatNit('901123456')).toBe('901.123.456')
    expect(formatNit('123')).toBe('123')
  })

  it('shows a NIT with dots and its check digit when the server sends it', () => {
    expect(formatCustomerDocument({ documentType: 'NIT', documentId: '901123456', documentDv: 1 })).toBe(
      'NIT 901.123.456-1',
    )
  })

  it('shows the value as it is when there is no check digit', () => {
    expect(formatCustomerDocument({ documentType: 'NIT', documentId: '901123456', documentDv: null })).toBe(
      'NIT 901123456',
    )
    expect(formatCustomerDocument({ documentType: 'NIT', documentId: '901123456' })).toBe('NIT 901123456')
    expect(formatCustomerDocument({ documentType: 'CC', documentId: '1020304050', documentDv: 5 })).toBe(
      'CC 1020304050',
    )
    expect(formatCustomerDocument({ documentType: null, documentId: 'X-1', documentDv: null })).toBe('X-1')
  })

  it('shows a dash when there is no document', () => {
    expect(formatCustomerDocument({ documentType: 'NIT', documentId: null, documentDv: null })).toBe('-')
  })
})
