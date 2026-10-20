import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('../services/api', () => ({
  default: { get, post },
  resolveAssetUrl: (path?: string) => path ?? '',
}))

import AssignedTargetsPage, {
  AssignedTargetsFormModal,
  TargetsErrorAlert,
} from './AssignedTargetsPage'
import {
  SalesTargetServiceError,
  targetsCanEdit,
  dedupeTargets,
  fetchSalesTargets,
  targetPeriodLabel,
} from '../services/dashboard-insights.service'
import type { SalesTargetRow } from '../services/dashboard-insights.service'
import { useAuthStore } from '../stores/auth.store'
import type { UserListItem } from '../services/users.service'

/**
 * COM-04 frontend — AssignedTargetsPage (render de servidor con caché sembrada,
 * el repo no tiene entorno DOM: patrón CustomersPage/ListasPage).
 *
 * ✅ ACEPTACIÓN 1 (lado cliente): sin criterio de edición NO hay formulario ni
 *    botón de escritura; el 403 del servidor se pinta CON SU MENSAJE (la UI no
 *    inventa reglas; el servidor manda).
 * ✅ ACEPTACIÓN 2 (lado cliente): dedup defensivo por (userId, period); el
 *    upsert refetchea sin append local, así que N reintentos dejan 1 fila.
 * ✅ ACEPTACIÓN 3 (lado cliente): recargar conserva amount/currency/«Confirmado
 *    por» desde el backend y el avance facturado se pinta SEPARADO (fuente
 *    /dashboard/team/:userId), nunca mezclado con la meta.
 */

const TARGETS_KEY = ['sales-targets', '']
const USERS_KEY = ['users', 'targets-directory']

function target(over: Partial<SalesTargetRow> & { userId: string; period: string }): SalesTargetRow {
  const id = `t-${over.userId}-${targetPeriodLabel(over.period)}`
  return {
    id,
    amount: '250000000',
    currency: 'COP',
    notes: 'Meta COM-04',
    setById: 'u-admin',
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    user: { id: over.userId, name: 'Vendedor Fixture', email: 'vendedor.fixture@test' },
    setBy: { id: 'u-admin', name: 'Administrador' },
    ...over,
  }
}

const PROPIA = target({ userId: 'u-vendedor', period: '2026-10-01T00:00:00.000Z' })
const EQUIPO = target({
  userId: 'u-otro',
  period: '2026-10-01T00:00:00.000Z',
  amount: '90000000',
  user: { id: 'u-otro', name: 'Integrante Equipo', email: 'equipo@test' },
  setBy: { id: 'u-sup', name: 'Supervisora Norte' },
})

const USERS: UserListItem[] = [
  {
    id: 'u-vendedor',
    email: 'vendedor.fixture@test',
    name: 'Vendedor Fixture',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r2', name: 'Vendedor' }],
  },
  {
    id: 'u-otro',
    email: 'equipo@test',
    name: 'Integrante Equipo',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r2', name: 'Vendedor' }],
  },
]

const INVOICED_EQUIPO = { amount: '45000000.00', currency: 'COP', mixedCurrency: false }

function login(roles: string[]) {
  const session = {
    isAuthenticated: true,
    user: {
      id: 'u-admin',
      name: 'Administrador',
      email: 'admin@test',
      roles,
      permissions: [],
    },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

function seededClient(rows: SalesTargetRow[] = [PROPIA, EQUIPO]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(TARGETS_KEY, rows)
  client.setQueryData(USERS_KEY, USERS)
  client.setQueryData(['member-invoiced', 'u-otro'], INVOICED_EQUIPO)
  return client
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AssignedTargetsPage />
    </QueryClientProvider>,
  )
}

const occurrences = (html: string, text: string) => html.split(text).length - 1

beforeEach(() => {
  vi.clearAllMocks()
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ data: [PROPIA, EQUIPO] })
  post.mockResolvedValue({ data: PROPIA })
  login(['Super Admin'])
})

describe('ACEPTACIÓN 1 — lector sin formulario; editor con criterio UX', () => {
  it('sin criterio de edición (Vendedor/Consulta) NO se ofrece formulario ni escritura', () => {
    login(['Vendedor'])
    const html = render(seededClient())

    expect(html).toContain('Vendedor Fixture')
    expect(html).not.toContain('Fijar meta')
    expect(html).not.toContain('Guardar meta')
    expect(html).not.toContain('Editar')
  })

  it('con criterio (Super Admin o Supervisor) SÍ se ofrece «Fijar meta» y «Editar»', () => {
    const html = render(seededClient())

    expect(html).toContain('Fijar meta')
    expect(occurrences(html, 'Editar')).toBe(2)
  })

  it('Supervisor también recibe el criterio de edición (espejo del guard del servidor)', () => {
    login(['Supervisor'])
    const html = render(seededClient())

    expect(html).toContain('Fijar meta')
  })

  it('targetsCanEdit es una función pura sobre roles (punto de extensión D5/E6/F3)', () => {
    expect(targetsCanEdit({ roles: ['Super Admin'] })).toBe(true)
    expect(targetsCanEdit({ roles: ['Supervisor'] })).toBe(true)
    expect(targetsCanEdit({ roles: ['Vendedor'] })).toBe(false)
    expect(targetsCanEdit({ roles: ['Admin Comercial'] })).toBe(false)
    expect(targetsCanEdit(null)).toBe(false)
  })

  it('el 403 del servidor se pinta CON SU MENSAJE (la UI no lo traduce ni lo maquilla)', () => {
    const error = new SalesTargetServiceError(
      'forbidden',
      'Sin permiso targets:edit sobre esta meta (no-covering-grant)',
      403,
    )

    const html = renderToStaticMarkup(<TargetsErrorAlert error={error} />)

    expect(html).toContain('Sin permiso targets:edit sobre esta meta (no-covering-grant)')
  })

  it('TargetsErrorAlert sin error no pinta nada', () => {
    expect(renderToStaticMarkup(<TargetsErrorAlert error={null} />)).toBe('')
  })
})

describe('tabla — meta y avance facturado SEPARADOS, integrante/periodo/confirmado por (ACEPTACIÓN 3)', () => {
  it('pinta integrante, periodo YYYY-MM, meta+moneda y «Confirmado por» desde el backend', () => {
    const html = render(seededClient())

    expect(html).toContain('Vendedor Fixture')
    expect(html).toContain('2026-10')
    expect(html).toContain('250.000.000')
    expect(html).toContain('Administrador')
    expect(html).toContain('Supervisora Norte')
  })

  it('el avance facturado viene de la fuente REAL separada (/dashboard/team/:userId)', () => {
    const html = render(seededClient())

    // Avance del Integrante Equipo: 45.000.000 COP, distinto de su meta 90.000.000.
    expect(html).toContain('45.000.000')
    expect(html).toContain('90.000.000')
    expect(html).toContain('Avance facturado')
    // La meta NO se calcula del avance ni al revés: son columnas distintas.
    expect(html).toContain('Meta')
  })

  it('dedup defensivo por (userId, period): duplicados en caché pintan UNA fila', () => {
    const duplicada = target({
      userId: 'u-otro',
      period: '2026-10-01T00:00:00.000Z',
      amount: '111000000',
      user: { id: 'u-otro', name: 'Integrante Equipo', email: 'equipo@test' },
    })
    const html = render(seededClient([PROPIA, EQUIPO, duplicada]))

    // 3 filas en caché → 2 tras el dedup (misma clave (userId, period)).
    expect(occurrences(html, '>2026-10</span>')).toBe(2)
    expect(html).toContain('111.000.000')
    expect(html).not.toContain('90.000.000')
  })

  it('targetPeriodLabel recorta el DATE día 1 a etiqueta YYYY-MM', () => {
    expect(targetPeriodLabel('2026-10-01T00:00:00.000Z')).toBe('2026-10')
    expect(targetPeriodLabel('2026-10')).toBe('2026-10')
  })

  it('dedupeTargets conserva la ÚLTIMA fila recibida por clave (userId, period)', () => {
    const rows = dedupeTargets([
      PROPIA,
      target({ userId: 'u-otro', period: '2026-10', amount: '1' }),
      target({ userId: 'u-otro', period: '2026-10', amount: '2' }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.userId === 'u-otro')?.amount).toBe('2')
  })
})

describe('recargar conserva cambios y fuente real (ACEPTACIÓN 3) — GET posterior', () => {
  it('una recarga (refetch del GET) pinta amount/currency/confirmadoPor tal cual el servidor', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    get.mockResolvedValueOnce({ data: [PROPIA] })
    const rows = await client.fetchQuery({ queryKey: TARGETS_KEY, queryFn: () => fetchSalesTargets() })
    expect(rows).toHaveLength(1)
    client.setQueryData(['member-invoiced', 'u-vendedor'], INVOICED_EQUIPO)

    const html = render(client)

    expect(html).toContain('250.000.000')
    expect(html).toContain('COP')
    expect(html).toContain('Administrador')
    expect(html).toContain('45.000.000')
  })
})

describe('formulario upsert — monto, moneda EXPLÍCITA, periodo y notas', () => {
  function renderForm() {
    return renderToStaticMarkup(
      <AssignedTargetsFormModal
        open
        onClose={() => {}}
        members={USERS}
        onSubmit={() => {}}
        isSubmitting={false}
      />,
    )
  }

  it('ofrece integrante, periodo YYYY-MM, monto, moneda y notas', () => {
    const html = renderForm()

    expect(html).toContain('Integrante')
    expect(html).toContain('Periodo')
    expect(html).toContain('Monto')
    expect(html).toContain('Moneda')
    expect(html).toContain('Notas')
    expect(html).toContain('Guardar meta')
  })

  it('la moneda es OBLIGATORIA y explícita: opciones COP/USD/EUR sin seleccionar default', () => {
    const html = renderForm()

    expect(html).toContain('value="COP"')
    expect(html).toContain('value="USD"')
    expect(html).toContain('value="EUR"')
    expect(html).toMatch(/<select[^>]*required/)
    // El placeholder de moneda arranca vacío: nadie envía un default sorpresivo.
    expect(html).toMatch(/<option value="" disabled[^>]*>Moneda/)
  })

  it('prefill de edición: amount/currency/periodo llegan desde la fila del backend', () => {
    const html = renderToStaticMarkup(
      <AssignedTargetsFormModal
        open
        onClose={() => {}}
        members={USERS}
        initialValues={{ userId: EQUIPO.userId, period: '2026-10', amount: '90000000', currency: 'COP', notes: 'Meta COM-04' }}
        onSubmit={() => {}}
        isSubmitting={false}
      />,
    )

    expect(html).toContain('value="90000000"')
    expect(html).toContain('value="2026-10"')
    expect(html).toContain('selected')
  })
})
