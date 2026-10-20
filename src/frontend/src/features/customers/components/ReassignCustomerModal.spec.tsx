import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReassignCustomerModal from './ReassignCustomerModal'
import type { Customer } from '../types/customer.types'
import type { UserListItem } from '../../../services/users.service'

/**
 * COM-02 frontend — modal de reasignación de cartera (aceptación 3, lado
 * cliente).
 *
 * ✅ Selector de responsable nuevo alimentado por el servicio de usuarios que
 *    la app ya usa (`fetchUsers`, misma clave de caché `['users','owners']`
 *    que la columna Responsable → una sola petición). F3 (consulta autorizada
 *    del responsable) sigue pendiente en el contrato: aquí NO se inventa gating.
 * ✅ Motivo opcional ≤500 (límite del DTO del servidor).
 * ✅ La UI NO pinta trazabilidad de auditoría: actor/antes-después son del
 *    backend (ya acreditado) — no se inventa pantalla de auditoría.
 */

const CUSTOMER: Customer = {
  id: 'c-1',
  code: 'CL-0003',
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
    id: 'owner-nuevo',
    email: 'compras@gruposecurity.co',
    name: 'Compras Security',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r2', name: 'Admin Comercial' }],
  },
]

function render(client: QueryClient, open = true) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ReassignCustomerModal
        open={open}
        onClose={() => {}}
        customer={CUSTOMER}
        onSubmit={async () => {}}
      />
    </QueryClientProvider>,
  )
}

function seededClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['users', 'owners'], USERS)
  return client
}

let client: QueryClient

beforeEach(() => {
  client = seededClient()
})

describe('ReasignCustomerModal', () => {
  it('cerrado no pinta nada', () => {
    expect(render(client, false)).toBe('')
  })

  it('ofrece el selector de responsable nuevo con los usuarios de la app', () => {
    const html = render(client)
    const select = /<select[^>]*>/.exec(html)?.[0] ?? ''

    expect(html).toContain('Nuevo responsable')
    expect(select).toContain('name="ownerId"')
    expect(select).toContain('required')
    expect(html).toContain('Administrador')
    expect(html).toContain('Compras Security')
    expect(html).toContain('Selecciona un responsable')
  })

  it('incluye el campo motivo opcional con el límite del servidor (500)', () => {
    const html = render(client)

    expect(html).toContain('name="motivo"')
    expect(html).toMatch(/maxlength="500"/i)
    expect(html).toContain('opcional')
  })

  it('identifica al cliente afectado y ofrece confirmar la reasignación', () => {
    const html = render(client)

    expect(html).toContain('Cliente Spot COM02')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[^<]*Reasignar/)
  })

  it('NO pinta trazabilidad de auditoría (actor/antes-después es del backend)', () => {
    const html = render(client)

    expect(html).not.toMatch(/auditor[ií]a/i)
    expect(html).not.toMatch(/registrado por/i)
    expect(html).not.toMatch(/responsable anterior/i)
    expect(html).not.toMatch(/antes\/despu[eé]s/i)
  })
})
