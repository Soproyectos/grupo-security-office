import { beforeEach, describe, expect, it, vi } from 'vitest'

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }))

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch, delete: vi.fn() } }))

import {
  CustomerServiceError,
  parseCustomerDuplicate,
  parseInvalidNitDv,
  updateCustomer,
} from './customers.service'

/**
 * 409 CUSTOMER_DUPLICATE: the form needs to know which field the warning
 * belongs to and, when the server says so, which customer already exists.
 */
const axios409 = (data: unknown) => ({ response: { status: 409, data } })

describe('parseCustomerDuplicate', () => {
  beforeEach(() => patch.mockReset())

  it('assigns the warning to the field the server names', () => {
    expect(
      parseCustomerDuplicate(
        axios409({ code: 'CUSTOMER_DUPLICATE', field: 'documentId', message: 'Ese documento ya existe.' }),
      ),
    ).toEqual({ field: 'documentId', message: 'Ese documento ya existe.' })
    expect(
      parseCustomerDuplicate(
        axios409({ code: 'CUSTOMER_DUPLICATE', field: 'email', message: 'Ese correo ya existe.' }),
      )?.field,
    ).toBe('email')
  })

  it('returns the existing customer so the form can offer the link', () => {
    const found = parseCustomerDuplicate(
      axios409({
        code: 'CUSTOMER_DUPLICATE',
        field: 'email',
        message: 'm',
        existing: { id: 'c-9', name: 'Andina S.A.S.' },
      }),
    )
    expect(found?.existing).toEqual({ id: 'c-9', name: 'Andina S.A.S.' })
  })

  it('offers no link when the customer is out of the reader scope', () => {
    expect(
      parseCustomerDuplicate(axios409({ code: 'CUSTOMER_DUPLICATE', field: 'documentId', message: 'm' })),
    ).not.toHaveProperty('existing')
  })

  it('falls back to a clear message when the server sends none', () => {
    expect(
      parseCustomerDuplicate(axios409({ code: 'CUSTOMER_DUPLICATE', field: 'email' }))?.message,
    ).toContain('correo')
  })

  it('also reads it from the typed error that updateCustomer throws', async () => {
    patch.mockRejectedValueOnce(
      axios409({
        code: 'CUSTOMER_DUPLICATE',
        field: 'documentId',
        message: 'Ya existe.',
        existing: { id: 'c-2', name: 'Otro' },
      }),
    )
    const error = await updateCustomer('c-1', { name: 'X' }).catch((e: unknown) => e)
    expect(parseCustomerDuplicate(error)).toEqual({
      field: 'documentId',
      message: 'Ya existe.',
      existing: { id: 'c-2', name: 'Otro' },
    })
  })

  it('ignores other conflicts and other errors', () => {
    expect(parseCustomerDuplicate(axios409({ message: 'cambió' }))).toBeNull()
    expect(
      parseCustomerDuplicate({ response: { status: 400, data: { code: 'CUSTOMER_DUPLICATE', field: 'email' } } }),
    ).toBeNull()
    expect(parseCustomerDuplicate(axios409({ code: 'CUSTOMER_DUPLICATE', field: 'phone' }))).toBeNull()
    expect(parseCustomerDuplicate(new Error('red'))).toBeNull()
  })
})

describe('parseInvalidNitDv', () => {
  const axios400 = (data: unknown) => ({ response: { status: 400, data } })

  it('returns the server message for INVALID_NIT_DV', () => {
    expect(
      parseInvalidNitDv(
        axios400({ code: 'INVALID_NIT_DV', field: 'documentId', message: 'El dígito no coincide.' }),
      ),
    ).toBe('El dígito no coincide.')
  })

  it('works with the typed error of the service', () => {
    const typed = new CustomerServiceError('invalid', 'm', 400, { code: 'INVALID_NIT_DV', message: 'Dígito errado.' })
    expect(parseInvalidNitDv(typed)).toBe('Dígito errado.')
  })

  it('falls back to a clear message when the server sends none', () => {
    expect(parseInvalidNitDv(axios400({ code: 'INVALID_NIT_DV' }))).toBe(
      'El dígito de verificación del NIT no coincide.',
    )
  })

  it('ignores other errors', () => {
    expect(parseInvalidNitDv(axios400({ code: 'OTHER', message: 'x' }))).toBeNull()
    expect(parseInvalidNitDv({ response: { status: 409, data: { code: 'INVALID_NIT_DV' } } })).toBeNull()
    expect(parseInvalidNitDv(new Error('red'))).toBeNull()
  })
})
