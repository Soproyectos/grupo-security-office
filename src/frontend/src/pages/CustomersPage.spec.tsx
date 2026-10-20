import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { get, post, patch, del, put } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  put: vi.fn(),
}))

vi.mock('../services/api', () => ({
  default: { get, post, patch, put, delete: del },
  resolveAssetUrl: (path?: string) => path ?? '',
}))

import CustomersPage from './CustomersPage'
import { fetchCustomers, reassignCustomerInCache } from '../services/customers.service'
import { useAuthStore } from '../stores/auth.store'
import type { Customer, CustomerListMeta } from '../features/customers/types/customer.types'
import type { UserListItem } from '../services/users.service'

/**
 * COM-02 frontend — CustomersPage (render de servidor con caché sembrada, el
 * repo no tiene entorno DOM: patrón ListasPage/AgendaCalendarPage).
 *
 * ✅ ACEPTACIÓN 2 (lado cliente): una fila de equipo (ownerId ajeno) que el
 *    servidor devolvió se pinta COMPLETA con «Editar» — la UI no oculta
 *    datos ajenos ni añade gating de edición por propiedad; el 403 del
 *    servidor es la fuente de verdad y su mensaje se pinta desde
 *    `customerErrorMessage`.
 * ✅ ACEPTACIÓN 3 (lado cliente): tras reasignar (refetch de la caché) la
 *    fila muestra el RESPONSABLE NUEVO. Sin PII de auditoría en pantalla.
 * ✅ Criterio de visibilidad documentado en `features/customers/access.ts`
 *    (punto de extensión a concesiones: D5/E6).
 */

const KEY = ['customers', {}, 1, 20]
const META: CustomerListMeta = { total: 2, skip: 0, take: 20, totalPages: 1 }

function customer(over: Partial<Customer> & { id: string }): Customer {
  return {
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
    ...over,
  }
}

const MIO = customer({ id: 'c-1', name: 'Cliente Propio', ownerId: 'owner-admin' })
const EQUIPO = customer({ id: 'c-2', name: 'Cliente Del Equipo', ownerId: 'vendedor-ajeno' })

const SERVER_OWNER = 'Compras Security'

const USERS: UserListItem[] = [
  {
    id: 'owner-admin',
    email: 'admin@gruposecurity.co',
    name: 'Administrador',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r1', name: 'Super Admin' }],
  },
  {
    id: 'vendedor-ajeno',
    email: 'vendedor.fixture@gruposecurity.co',
    name: 'Vendedor Fixture',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r2', name: 'Vendedor' }],
  },
  {
    id: 'owner-nuevo',
    email: 'compras@gruposecurity.co',
    name: SERVER_OWNER,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r3', name: 'Admin Comercial' }],
  },
]

function login(roles: string[]) {
  const session = {
    isAuthenticated: true,
    user: {
      id: 'owner-admin',
      name: 'Administrador',
      email: 'admin@gruposecurity.co',
      roles,
      permissions: [],
    },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

function seededClient(rows: Customer[] = [MIO, EQUIPO]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(KEY, { data: rows, meta: { ...META, total: rows.length } })
  client.setQueryData(['users', 'owners'], USERS)
  return client
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CustomersPage />
    </QueryClientProvider>,
  )
}

const occurrences = (html: string, text: string) => html.split(text).length - 1

beforeEach(() => {
  vi.clearAllMocks()
  get.mockReset()
  patch.mockReset()
  login(['Super Admin'])
})

describe('filas devueltas por el servidor (ACEPTACIÓN 2 — lectura no gating de edición)', () => {
  it('una fila de equipo (ownerId ajeno) conserva «Editar»: la UI no oculta datos que el servidor ya devolvió', () => {
    const html = render(seededClient())

    expect(html).toContain('Cliente Del Equipo')
    expect(occurrences(html, 'Editar')).toBe(2)
    expect(occurrences(html, 'Reasignar')).toBe(2)
    expect(html).not.toContain('Sin permiso')
  })

  it('pinta los responsables desde el directorio de usuarios (columna Responsable)', () => {
    const html = render(seededClient())

    expect(html).toContain('Responsable')
    expect(html).toContain('Administrador')
    expect(html).toContain('Vendedor Fixture')
  })
})

describe('criterio de visibilidad por rol (punto de extensión a concesiones)', () => {
  it('Vendedor: sin columna Responsable ni botón Reasignar, pero la fila editable sigue visible', () => {
    login(['Vendedor'])
    const html = render(seededClient())

    expect(html).not.toContain('Reasignar')
    expect(html).not.toContain('>Responsable<')
    expect(html).toContain('Editar')
    expect(html).toContain('Cliente Del Equipo')
  })

  it('Supervisor: sí se le ofrece reasignar (el 403 del servidor sigue mandando)', () => {
    login(['Supervisor'])
    const html = render(seededClient())

    expect(html).toContain('Reasignar')
    expect(html).toContain('Responsable')
  })
})

describe('tras reasignar la fila muestra el responsable nuevo (ACEPTACIÓN 3)', () => {
  it('refetch de la caché → la columna Responsable refleja el nuevo responsable', async () => {
    // Caché con la consulta YA RECIBIDA (como en el navegador): react-query
    // solo refetchea consultas con `isFetched` — setQueryData no basta.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    get.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/users')) return { data: { data: USERS } }
      return { data: { data: [MIO, EQUIPO], meta: { ...META, total: 2 } } }
    })
    await client.fetchQuery({ queryKey: KEY, queryFn: () => fetchCustomers({}, 1, 20) })
    client.setQueryData(['users', 'owners'], USERS)

    const ANTES = render(client)
    expect(ANTES).toContain('Administrador')

    get.mockImplementation(async (url: string) => {
      if (url === '/commercial/customers/c-1') return { data: MIO }
      if (String(url).startsWith('/commercial/customers?')) {
        return { data: { data: [{ ...MIO, ownerId: 'owner-nuevo' }, EQUIPO], meta: { ...META, total: 2 } } }
      }
      return { data: { data: USERS } }
    })
    patch.mockResolvedValue({ data: { ...MIO, ownerId: 'owner-nuevo' } })

    await reassignCustomerInCache(client, {
      id: 'c-1',
      payload: { ownerId: 'owner-nuevo', motivo: 'Cambio de cartera' },
      expected: { ownerId: 'owner-admin' },
    })

    const DESPUES = render(client)
    expect(DESPUES).toContain('Compras Security')
    expect(DESPUES).not.toContain('Administrador')
    expect(DESPUES).not.toMatch(/auditor[ií]a/i)
  })
})
