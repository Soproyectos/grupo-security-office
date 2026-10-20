import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('./api', () => ({ default: { get, post, patch, delete: del } }))

import {
  CustomerServiceError,
  customerErrorMessage,
  fetchCustomers,
  reassignCustomer,
  reassignCustomerInCache,
  toCustomerEditPayload,
  updateCustomer,
  type CustomerEditPayload,
} from './customers.service'
import type { Customer, CustomerListMeta } from '../features/customers/types/customer.types'

/**
 * COM-02 frontend — contrato de servidor consumido desde el navegador.
 *
 * ✅ ACEPTACIÓN 1 (lado cliente): el payload de edición general NUNCA lleva
 *    `ownerId`/`status`/`isActive` — el servidor responde 400 si aparecen
 *    (COM-02 §11 «riesgo de transición»); el tipo lo impide y el servicio
 *    además los retira.
 * ✅ ACEPTACIÓN 3 (lado cliente): tras reasignar, la caché se invalida y la
 *    fila refleja el responsable nuevo; la trazabilidad de auditoría es del
 *    backend (ya acreditada) y aquí no se pinta PII de auditoría.
 * ✅ Errores tipados 400/403/404 con el mensaje del servidor TAL CUAL y
 *    reservas claras para el 403 de transición (sin concesiones aún).
 */

const CUSTOMER: Customer = {
  id: 'c-1',
  code: 'CL-0001',
  name: 'Cliente Spot COM02',
  documentType: null,
  documentId: null,
  email: 'spot@fixture.test',
  phone: null,
  city: null,
  address: null,
  status: 'LEAD',
  source: null,
  sourceDetail: null,
  ownerId: 'owner-admin',
  createdById: 'owner-admin',
  convertedAt: null,
  lastContactAt: null,
  notes: null,
  isActive: true,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
}

const META: CustomerListMeta = { total: 1, skip: 0, take: 20, totalPages: 1 }

function httpError(status: number, message?: string | string[]) {
  return { response: { status, data: message ? { statusCode: status, message } : {} } }
}

const networkError = () => Object.assign(new Error('Network Error'), { response: undefined })

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('edición general — payload limpio (COM-02 §5.1)', () => {
  it('updateCustomer hace PATCH al endpoint del cliente y devuelve el registro', async () => {
    patch.mockResolvedValue({ data: { ...CUSTOMER, city: 'Bogotá' } })

    const updated = await updateCustomer('c-1', { name: 'Cliente Spot COM02', city: 'Bogotá' })

    expect(patch).toHaveBeenCalledWith('/commercial/customers/c-1', {
      name: 'Cliente Spot COM02',
      city: 'Bogotá',
    })
    expect(updated.city).toBe('Bogotá')
  })

  it('el payload NUNCA contiene ownerId, status ni isActive aunque el llamador los pase', async () => {
    patch.mockResolvedValue({ data: CUSTOMER })

    await updateCustomer('c-1', {
      name: 'Solo contacto',
      email: 'nuevo@fixture.test',
      status: 'INACTIVO',
      ownerId: 'otro-vendedor',
      isActive: false,
    } as unknown as CustomerEditPayload)

    const [, body] = vi.mocked(patch).mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ name: 'Solo contacto', email: 'nuevo@fixture.test' })
    expect(body).not.toHaveProperty('status')
    expect(body).not.toHaveProperty('ownerId')
    expect(body).not.toHaveProperty('isActive')
  })

  it('toCustomerEditPayload retira los campos prohibidos del payload de edición', () => {
    const edit = toCustomerEditPayload({
      name: 'Cliente',
      status: 'CLIENTE',
      notes: 'n',
    })

    expect(edit).toEqual({ name: 'Cliente', notes: 'n' })
    expect(edit).not.toHaveProperty('status')
  })

  it('400 del servidor (owner-not-allowed-in-general-edit) → error tipado con el mensaje tal cual', async () => {
    patch.mockRejectedValue(
      httpError(
        400,
        'owner-not-allowed-in-general-edit: use PATCH /:id/reassign (customers:reassign)',
      ),
    )

    const failure = await updateCustomer('c-1', { name: 'X' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CustomerServiceError)
    expect((failure as CustomerServiceError).code).toBe('invalid')
    expect((failure as CustomerServiceError).status).toBe(400)
    expect((failure as CustomerServiceError).message).toBe(
      'owner-not-allowed-in-general-edit: use PATCH /:id/reassign (customers:reassign)',
    )
  })

  it('403 de transición (sin concesiones) → error tipado con el mensaje del servidor', async () => {
    patch.mockRejectedValue(
      httpError(403, 'Sin permiso customers:edit sobre este cliente (no-covering-grant)'),
    )

    const failure = await updateCustomer('c-1', { name: 'X' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CustomerServiceError)
    expect((failure as CustomerServiceError).code).toBe('forbidden')
    expect((failure as CustomerServiceError).message).toBe(
      'Sin permiso customers:edit sobre este cliente (no-covering-grant)',
    )
  })

  it('404 fuera de alcance → error tipado not-found con el mensaje del servidor', async () => {
    patch.mockRejectedValue(httpError(404, 'Cliente no encontrado'))

    const failure = await updateCustomer('c-1', { name: 'X' }).catch((error: unknown) => error)

    expect((failure as CustomerServiceError).code).toBe('not-found')
    expect((failure as CustomerServiceError).message).toBe('Cliente no encontrado')
  })

  it('la red caída se propaga sin envolver para que la página ofrezca reintentar', async () => {
    const failure = networkError()
    patch.mockRejectedValue(failure)

    await expect(updateCustomer('c-1', { name: 'X' })).rejects.toBe(failure)
  })
})

describe('reassignCustomer — endpoint dedicado (COM-02 §3)', () => {
  it('PATCH /:id/reassign con { ownerId, motivo } exactos y devuelve el cliente', async () => {
    patch.mockResolvedValue({ data: { ...CUSTOMER, ownerId: 'owner-nuevo' } })

    const result = await reassignCustomer('c-1', { ownerId: 'owner-nuevo', motivo: 'Cambio de cartera' })

    expect(patch).toHaveBeenCalledWith('/commercial/customers/c-1/reassign', {
      ownerId: 'owner-nuevo',
      motivo: 'Cambio de cartera',
    })
    expect(result.ownerId).toBe('owner-nuevo')
  })

  it('sin motivo envía SOLO ownerId (no inventa campos)', async () => {
    patch.mockResolvedValue({ data: { ...CUSTOMER, ownerId: 'owner-nuevo' } })

    await reassignCustomer('c-1', { ownerId: 'owner-nuevo' })

    expect(patch).toHaveBeenCalledWith('/commercial/customers/c-1/reassign', { ownerId: 'owner-nuevo' })
  })

  it('403 sin customers:reassign → error tipado con el mensaje del servidor tal cual', async () => {
    patch.mockRejectedValue(
      httpError(403, 'Sin permiso customers:reassign sobre este cliente (no-covering-grant)'),
    )

    const failure = await reassignCustomer('c-1', { ownerId: 'x' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CustomerServiceError)
    expect((failure as CustomerServiceError).code).toBe('forbidden')
    expect((failure as CustomerServiceError).message).toBe(
      'Sin permiso customers:reassign sobre este cliente (no-covering-grant)',
    )
  })

  it('400 con responsable inexistente → error tipado invalid con el mensaje tal cual', async () => {
    patch.mockRejectedValue(httpError(400, 'owner-not-found: el nuevo responsable no existe o está inactivo'))

    const failure = await reassignCustomer('c-1', { ownerId: 'no-uuid' }).catch((error: unknown) => error)

    expect((failure as CustomerServiceError).code).toBe('invalid')
    expect((failure as CustomerServiceError).message).toBe(
      'owner-not-found: el nuevo responsable no existe o está inactivo',
    )
  })

  it('404 fuera de alcance → error tipado not-found', async () => {
    patch.mockRejectedValue(httpError(404, 'Cliente no encontrado'))

    const failure = await reassignCustomer('c-1', { ownerId: 'x' }).catch((error: unknown) => error)

    expect((failure as CustomerServiceError).code).toBe('not-found')
    expect((failure as CustomerServiceError).message).toBe('Cliente no encontrado')
  })

  it('expected: si el responsable del servidor YA cambió no escribe y devuelve conflict', async () => {
    get.mockResolvedValue({ data: { ...CUSTOMER, ownerId: 'otro-responsable' } })

    const failure = await reassignCustomer(
      'c-1',
      { ownerId: 'owner-nuevo' },
      { ownerId: 'owner-admin' },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CustomerServiceError)
    expect((failure as CustomerServiceError).code).toBe('conflict')
    expect(get).toHaveBeenCalledWith('/commercial/customers/c-1')
    expect(patch).not.toHaveBeenCalled()
  })

  it('expected: si coincide con el servidor procede con la reasignación', async () => {
    get.mockResolvedValue({ data: CUSTOMER })
    patch.mockResolvedValue({ data: { ...CUSTOMER, ownerId: 'owner-nuevo' } })

    await reassignCustomer('c-1', { ownerId: 'owner-nuevo' }, { ownerId: 'owner-admin' })

    expect(patch).toHaveBeenCalledWith('/commercial/customers/c-1/reassign', { ownerId: 'owner-nuevo' })
  })
})

describe('reassignCustomerInCache — refetch tras 200 (ACEPTACIÓN 3)', () => {
  const KEY = ['customers', {}, 1, 20]
  const SEED = { data: [CUSTOMER], meta: META }

  /** Caché con la consulta YA RECIBIDA del servidor (como en el navegador):
   *  una entrada creada solo con setQueryData no es refetcheable por
   *  react-query (`isDisabled` → `!isFetched`). */
  async function seedFetchedClient() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    get.mockResolvedValue({ data: SEED })
    await client.fetchQuery({ queryKey: KEY, queryFn: () => fetchCustomers({}, 1, 20) })
    get.mockReset()
    return client
  }

  it('tras 200 invalida la caché de clientes y la fila refleja el responsable nuevo', async () => {
    const client = await seedFetchedClient()
    patch.mockResolvedValue({ data: { ...CUSTOMER, ownerId: 'owner-nuevo' } })
    get.mockResolvedValue({ data: { data: [{ ...CUSTOMER, ownerId: 'owner-nuevo' }], meta: META } })

    await reassignCustomerInCache(client, {
      id: 'c-1',
      payload: { ownerId: 'owner-nuevo', motivo: 'Cambio de cartera' },
    })

    const after = client.getQueryData(KEY) as typeof SEED
    expect(after.data[0]?.ownerId).toBe('owner-nuevo')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('en 403 no toca la caché: ni invalida ni refetchea (botones y API concuerdan)', async () => {
    const client = await seedFetchedClient()
    patch.mockRejectedValue(httpError(403, 'Sin permiso customers:reassign sobre este cliente'))

    await expect(
      reassignCustomerInCache(client, { id: 'c-1', payload: { ownerId: 'owner-nuevo' } }),
    ).rejects.toBeInstanceOf(CustomerServiceError)

    expect(client.getQueryData(KEY)).toEqual(SEED)
    // Solo la petición de siembra: ningún refetch posterior.
    expect(get).not.toHaveBeenCalled()
  })
})

describe('customerErrorMessage — texto que pinta la UI', () => {
  it('usa el mensaje del servidor cuando lo trae (400/403/404)', () => {
    expect(customerErrorMessage(httpError(400, 'owner-not-allowed-in-general-edit: use PATCH'))).toBe(
      'owner-not-allowed-in-general-edit: use PATCH',
    )
    expect(customerErrorMessage(httpError(403, 'Sin permiso customers:reassign sobre este cliente'))).toBe(
      'Sin permiso customers:reassign sobre este cliente',
    )
    expect(customerErrorMessage(httpError(404, 'Cliente no encontrado'))).toBe('Cliente no encontrado')
  })

  it('403 de transición sin texto → reserva clara sobre concesiones', () => {
    expect(customerErrorMessage(httpError(403))).toMatch(/permiso/)
    expect(customerErrorMessage(httpError(403))).toMatch(/concesiones/)
  })

  it('un message en array de class-validator se une en texto legible', () => {
    expect(customerErrorMessage(httpError(400, ['ownerId debe ser un UUID.', 'Revisar.']))).toBe(
      'ownerId debe ser un UUID. Revisar.',
    )
  })
})

describe('fetchCustomers — sigue envolviendo el listado del servidor', () => {
  it('devuelve { data, meta } tal cual y arma los filtros de query', async () => {
    get.mockResolvedValue({ data: { data: [CUSTOMER], meta: META } })

    const page = await fetchCustomers({ search: ' spot ', status: 'LEAD', ownerId: 'owner-admin' }, 2, 20)

    expect(get).toHaveBeenCalledWith(
      '/commercial/customers?skip=20&take=20&search=spot&status=LEAD&ownerId=owner-admin',
    )
    expect(page.data).toHaveLength(1)
    expect(page.meta.total).toBe(1)
  })
})
