import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AgendaCalendarPage from './AgendaCalendarPage'
import { useAuthStore } from '../../stores/auth.store'
import { userAccessKey } from '../users/access'
import type { AccessGrant } from '../../services/users.service'
import {
  agendaActivitiesKey,
  mergeAgendaActivities,
  type AgendaActivity,
} from '../../services/agenda.service'
import { colombiaDay } from '../supervisor/calendar-dates'

/**
 * El repo no tiene entorno DOM ni @testing-library, así que la página se afirma
 * en render de servidor con la caché de react-query SEMBRADA (mismo patrón que
 * catalog-index-page.spec.tsx). Los clicks no se pueden disparar aquí; el
 * recorrido HTTP crear/completar/409/recarga vive en agenda.service.spec.ts.
 * Lo que SÍ se cubre aquí es la aceptación del paso:
 *   «Crear/completar/recargar conserva actividades sin entradas duplicadas
 *    por panel» — tanto en una vista como en DOS vistas montadas sobre el
 *    mismo estado (las rutas /sales/agenda y /supervisor/agenda).
 *
 * Incremento frontend-equipo: «Solo Agenda propia no muestra equipo». Como en
 * render de servidor react-query nunca ejecuta `queryFn`, la llamada al
 * directorio de vendedores se afirma en el punto donde la página la declara:
 * se envuelve `useQuery` (solo en este archivo) para leer las opciones reales
 * que la página monta — `enabled:false` significa que la API del equipo no se
 * llama jamás para un vendedor.
 */

const captured = vi.hoisted(() => ({ queries: [] as Array<{ key?: unknown; enabled?: boolean }> }))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...real,
    useQuery: (options: { queryKey?: readonly unknown[]; enabled?: boolean }) => {
      captured.queries.push({ key: options.queryKey?.[0], enabled: options.enabled })
      return (real.useQuery as unknown as (o: unknown) => unknown)(options)
    },
  }
})


const USER = 'user-1'
const OTHER = 'seller-2'
const KEY = agendaActivitiesKey(USER)
const TODAY = colombiaDay()

function row(over: Partial<AgendaActivity> & { id: string }): AgendaActivity {
  return {
    title: 'Visita al proyecto Los Robles',
    kind: 'VISIT',
    startsAt: `${TODAY}T15:00:00.000Z`,
    status: 'PENDING',
    assigneeId: USER,
    creatorId: USER,
    assignee: { id: USER, name: 'Usuario de prueba' },
    creator: { id: USER, name: 'Usuario de prueba' },
    updatedBy: null,
    events: [],
    ...over,
  }
}

function login(roles: string[]) {
  const session = {
    isAuthenticated: true,
    user: { id: USER, name: 'Usuario de prueba', email: 'user@example.invalid', roles, permissions: [] },
  }
  useAuthStore.setState(session)
  // zustand v5 usa `getInitialState()` como server snapshot: el render de
  // servidor (este repo no tiene entorno DOM) lee la sesión de ahí.
  Object.assign(useAuthStore.getInitialState(), session)
}

function render(client: QueryClient, grants: AccessGrant[] = []) {
  client.setQueryData(userAccessKey(USER), {
    catalogVersion: 'panels-20261019-3',
    accessVersion: 1,
    grants,
    sources: [],
    packages: [],
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgendaCalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function seeded(rows: AgendaActivity[]) {
  const client = new QueryClient()
  client.setQueryData(KEY, rows)
  return client
}

/** Cada fila del calendario lleva el título una sola vez en su atributo `title`. */
const rowsOf = (html: string, title: string) => html.split(`title="${title}"`).length - 1

const occurrences = (html: string, text: string) => html.split(text).length - 1

beforeEach(() => {
  login(['Vendedor'])
})

describe('ACEPTACIÓN — una fila por actividad tras crear/recargar', () => {
  it('muestra cada actividad una sola vez aunque el estado la tenga duplicada', () => {
    const client = seeded([row({ id: 'a1' }), { ...row({ id: 'a1' }) }, row({ id: 'a2', title: 'Llamada cliente ACME' })])

    const html = render(client)

    expect(rowsOf(html, 'Visita al proyecto Los Robles')).toBe(1)
    expect(rowsOf(html, 'Llamada cliente ACME')).toBe(1)
    expect(html).toContain('2 actividades en este periodo')
  })

  it('crear, recargar con la fila duplicada y completar no multiplican las filas del panel', () => {
    const client = seeded([])

    expect(render(client)).toContain('0 actividades en este periodo')

    client.setQueryData<AgendaActivity[]>(KEY, prev => mergeAgendaActivities(prev, [row({ id: 'a1' })]))
    const creada = render(client)
    expect(rowsOf(creada, 'Visita al proyecto Los Robles')).toBe(1)
    expect(creada).toContain('1 actividades en este periodo')

    client.setQueryData<AgendaActivity[]>(KEY, prev => [...(prev ?? []), { ...(prev ?? [])[0]! }])
    const recargada = render(client)
    expect(rowsOf(recargada, 'Visita al proyecto Los Robles')).toBe(1)
    expect(recargada).toContain('1 actividades en este periodo')

    client.setQueryData<AgendaActivity[]>(KEY, prev => (prev ?? []).map(r => (r.id === 'a1' ? { ...r, status: 'COMPLETED' } : r)))
    const completada = render(client)
    expect(completada).toContain('0 actividades en este periodo')
    expect(occurrences(completada, 'title="Visita al proyecto Los Robles"')).toBe(0)
  })

  it('dos vistas del mismo panel (rutas /sales/agenda y /supervisor/agenda) comparten el estado sin duplicar filas', () => {
    const duplicada = row({ id: 'a1' })
    const estado = [duplicada, { ...duplicada }, row({ id: 'a2', title: 'Llamada cliente ACME' })]
    const client = seeded(estado)

    const vistaVendedor = render(client)
    const vistaSupervisor = render(client)

    expect(rowsOf(vistaVendedor, 'Visita al proyecto Los Robles')).toBe(1)
    expect(rowsOf(vistaSupervisor, 'Visita al proyecto Los Robles')).toBe(1)
    expect(rowsOf(vistaVendedor, 'Llamada cliente ACME')).toBe(1)
    expect(rowsOf(vistaSupervisor, 'Llamada cliente ACME')).toBe(1)
    // El render no escribe en el estado: la recarga es la única fuente de filas.
    expect(client.getQueryData(KEY)).toEqual(estado)
    expect((client.getQueryData(KEY) as AgendaActivity[]).map(r => r.id)).toEqual(['a1', 'a1', 'a2'])
  })
})

describe('vista propia por defecto (incremento propias)', () => {
  it('Mi agenda es la vista por defecto y solo muestra lo asignado a quien navega', () => {
    login(['Super Admin'])
    const client = seeded([
      row({ id: 'a1' }),
      row({ id: 'b1', title: 'Visita a cliente ajeno', assigneeId: OTHER, assignee: { id: OTHER, name: 'Otra Persona' } }),
    ])

    const html = render(client)

    expect(html).toMatch(/<h1[^>]*>Mi agenda<\/h1>/)
    expect(rowsOf(html, 'Visita al proyecto Los Robles')).toBe(1)
    expect(rowsOf(html, 'Visita a cliente ajeno')).toBe(0)
  })

  it('deja el filtro Mis vendedores para la vista de equipo, no para la propia', () => {
    login(['Super Admin'])
    const client = seeded([row({ id: 'a1' })])

    expect(render(client)).not.toContain('Mis vendedores')
  })
})

describe('vista de equipo por concesiones vigentes', () => {
  it('un supervisor sin grant no ve Agenda del equipo ni carga vendedores', () => {
    login(['Supervisor'])
    captured.queries.length = 0
    const client = seeded([row({ id: 'a1' })])

    const html = render(client)

    expect(html).not.toContain('Agenda del equipo')
    expect(captured.queries.find(q => q.key === 'workflow-sellers')?.enabled).toBe(false)
    expect(html).toMatch(/<h1[^>]*>Mi agenda<\/h1>/)
  })

  it('un usuario con activities:read de equipo ve el selector y carga vendedores', () => {
    login(['Vendedor'])
    captured.queries.length = 0
    const client = seeded([row({ id: 'a1' })])

    const html = render(client, [{ sourceId: 'src-1', actionId: 'activities:read', scope: 'team' }])

    expect(html).toContain('Agenda del equipo')
    expect(captured.queries.find(q => q.key === 'workflow-sellers')?.enabled).toBe(true)
  })

  it('quien no es supervisor nunca ve Agenda del equipo', () => {
    login(['Vendedor'])
    const client = seeded([row({ id: 'a1' })])

    const html = render(client)

    expect(html).not.toContain('Agenda del equipo')
    expect(html).not.toContain('Mis vendedores')
  })
})

describe('«Solo Agenda propia no muestra equipo» (sin permiso no hay llamada de equipo)', () => {
  it('vendedor: ni toggle, ni fieldset de vendedores, ni query de equipo habilitada', () => {
    login(['Vendedor'])
    captured.queries.length = 0
    const client = seeded([row({ id: 'a1' })])

    const html = render(client)

    expect(html).not.toContain('Agenda del equipo')
    expect(html).not.toContain('Mis vendedores')

    const equipo = captured.queries.find(q => q.key === 'workflow-sellers')
    expect(equipo).toBeDefined()
    expect(equipo?.enabled).toBe(false)
    // La agenda propia sí se pide: la herramienta personal sigue funcionando.
    expect(captured.queries.some(q => q.key === 'team-workflow')).toBe(true)
  })

  it('con equipo el toggle existe y su query corresponde al alcance team', () => {
    login(['Vendedor'])
    captured.queries.length = 0
    const client = seeded([row({ id: 'a1' })])

    const html = render(client, [{ sourceId: 'src-1', actionId: 'activities:read', scope: 'team' }])

    expect(html).toContain('Agenda del equipo')
    expect(captured.queries.find(q => q.key === 'workflow-sellers')?.enabled).toBe(true)
    // La misma clave de actividades sostiene ambas vistas: un solo panel.
    expect(captured.queries.filter(q => q.key === 'team-workflow')).toHaveLength(1)
  })
})
