import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AgendaCalendarPage from './AgendaCalendarPage'
import { useAuthStore } from '../../stores/auth.store'
import { userAccessKey } from '../users/access'
import type { AccessGrant } from '../../services/users.service'
import {
  AgendaServiceError,
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

function render(client: QueryClient, grants: AccessGrant[] = [], scope: 'own' | 'team' = 'own') {
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
        <AgendaCalendarPage initialScope={scope} />
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

describe('calendario de solo lectura', () => {
  it('conserva las fechas y el detalle sin ofrecer crear actividades', () => {
    login([])
    const html = render(seeded([row({ id: 'readonly-activity' })]), [
      { sourceId: 'read-only', actionId: 'activities:read', scope: 'own' },
    ])

    expect(html).not.toContain('Crear actividad')
    expect(rowsOf(html, 'Visita al proyecto Los Robles')).toBe(1)
    const dateLabel = new Intl.DateTimeFormat('es-CO', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota',
    }).format(new Date(`${TODAY}T12:00:00Z`))
    expect(html).toContain(`<span aria-label="${dateLabel}"`)
  })
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

  it('deja el filtro Personas del equipo para la vista de equipo, no para la propia', () => {
    login(['Super Admin'])
    const client = seeded([row({ id: 'a1' })])

    expect(render(client)).not.toContain('Personas del equipo')
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
    expect(html).not.toContain('Personas del equipo')
  })
})

describe('«Solo Agenda propia no muestra equipo» (sin permiso no hay llamada de equipo)', () => {
  it('vendedor: ni toggle, ni fieldset de vendedores, ni query de equipo habilitada', () => {
    login(['Vendedor'])
    captured.queries.length = 0
    const client = seeded([row({ id: 'a1' })])

    const html = render(client)

    expect(html).not.toContain('Agenda del equipo')
    expect(html).not.toContain('Personas del equipo')

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

// ---------------------------------------------------------------------------
// Agenda de equipo (agenda-equipos-y-permisos, T4/T5). La vista de equipo se
// monta con `initialScope="team"` porque en render de servidor no hay clicks.
// ---------------------------------------------------------------------------

const SELLERS_KEY = ['workflow-sellers', USER]
const TEAM_READ = [{ sourceId: 'src-1', actionId: 'activities:read', scope: 'team' as const }]
const TEAM_ASSIGN = [...TEAM_READ, { sourceId: 'src-1', actionId: 'activities:assign', scope: 'team' as const }]
const ANA = { id: OTHER, name: 'Ana del Equipo' }
const teamRow = (over: Partial<AgendaActivity> & { id: string }) =>
  row({ title: 'Tarea de Ana', assigneeId: OTHER, assignee: ANA, ...over })

function seededTeam(rows: AgendaActivity[], people: { id: string; name: string }[] = [ANA]) {
  const client = seeded(rows)
  client.setQueryData(SELLERS_KEY, people)
  return client
}

describe('equipo en solo lectura (puede ver equipo, no asignar)', () => {
  beforeEach(() => login(['Operador']))

  it('ve las tareas del equipo con el nombre de cada persona y sin banner de error', () => {
    const html = render(seededTeam([row({ id: 'a1' }), teamRow({ id: 't1' })]), TEAM_READ, 'team')

    expect(html).toMatch(/<h1[^>]*>Agenda del equipo<\/h1>/)
    expect(rowsOf(html, 'Tarea de Ana')).toBe(1)
    expect(html).toContain('Ana del Equipo')
    expect(html).not.toContain('No se pudo cargar la agenda')
    expect(html).toContain('Personas del equipo')
  })

  it('no ofrece Reasignar ni selector de persona fuera del diálogo', () => {
    const html = render(seededTeam([teamRow({ id: 't1' })]), TEAM_READ, 'team')

    expect(html).not.toContain('Reasignar')
    expect(html).not.toContain('Asignar a')
    expect(html).not.toContain('Selecciona una persona')
  })

  it('sigue pudiendo crear en su propia agenda', () => {
    const html = render(seededTeam([teamRow({ id: 't1' })]), TEAM_READ, 'team')

    expect(html).toContain('Crear actividad')
  })

  it('un 403 del directorio se trata como «sin equipo»: sin banner de error y con guía', () => {
    // retryOnMount:false keeps the seeded error: SSR would otherwise reset it to pending.
    const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } })
    client.setQueryData(KEY, [])
    client.getQueryCache().build(client, { queryKey: SELLERS_KEY }).setState({
      status: 'error',
      error: new AgendaServiceError('forbidden', 'No tienes permiso para ver a tu equipo.', 403, 'TEAM_DIRECTORY_FORBIDDEN'),
      fetchStatus: 'idle',
    })

    const html = render(client, TEAM_READ, 'team')

    expect(html).not.toContain('No se pudo cargar la agenda')
    expect(html).toContain('Todavía no tienes personas a tu cargo')
  })

  it('un fallo real de red del directorio sí muestra el aviso con Reintentar', () => {
    // retryOnMount:false keeps the seeded error: SSR would otherwise reset it to pending.
    const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } })
    client.setQueryData(KEY, [])
    client.getQueryCache().build(client, { queryKey: SELLERS_KEY }).setState({
      status: 'error',
      error: new Error('Network Error'),
      fetchStatus: 'idle',
    })

    const html = render(client, TEAM_READ, 'team')

    expect(html).toContain('No se pudo cargar la agenda')
    expect(html).toContain('Reintentar')
  })
})

describe('estado vacío que guía', () => {
  it('agenda propia sin tareas invita a crear la primera', () => {
    login(['Vendedor'])

    const html = render(seeded([]))

    expect(html).toContain('Todavía no tienes tareas')
    expect(html).toContain('Crear actividad')
  })

  it('equipo con personas pero sin tareas lo dice con otras palabras', () => {
    login(['Operador'])

    const html = render(seededTeam([]), TEAM_READ, 'team')

    expect(html).toContain('Tu equipo todavía no tiene tareas')
    expect(html).not.toContain('Todavía no tienes personas a tu cargo')
  })

  it('equipo sin personas explica por qué no hay nada', () => {
    login(['Operador'])

    const html = render(seededTeam([], []), TEAM_READ, 'team')

    expect(html).toContain('Todavía no tienes personas a tu cargo')
  })

  it('si los filtros ocultan todo, lo dice en vez de parecer vacío', () => {
    login(['Vendedor'])

    const html = render(seeded([row({ id: 'a1', status: 'COMPLETED' })]))

    expect(html).toContain('Ninguna tarea coincide con los filtros')
  })

  it('no aparece cuando hay tareas visibles', () => {
    login(['Vendedor'])

    const html = render(seeded([row({ id: 'a1' })]))

    expect(html).not.toContain('Todavía no tienes tareas')
    expect(html).not.toContain('Ninguna tarea coincide')
  })
})

describe('equipo con permiso de asignar', () => {
  it('el filtro de personas lista a todo el equipo, no solo vendedores', () => {
    login(['Operador'])
    const people = [ANA, { id: 'p-9', name: 'Raúl Consulta' }]

    const html = render(seededTeam([teamRow({ id: 't1' })], people), TEAM_ASSIGN, 'team')

    expect(html).toContain('Ana del Equipo')
    expect(html).toContain('Raúl Consulta')
    expect(html).not.toContain('Mis vendedores')
  })
})

describe('agenda de responsables y roles internos', () => {
  it.each(['Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta'])('%s conserva agenda propia y recibe equipo desde la API', role => {
    login([role])
    const client = seededTeam([row({ id: 'own' }), teamRow({ id: 'team' })])
    const own = render(client)
    expect(own).toContain('<h1 class="sr-only">Mi agenda</h1>')
    expect(own).toContain('Crear actividad')
    expect(rowsOf(own, 'Tarea de Ana')).toBe(0)
    expect(own).not.toContain('Agenda del equipo')

    const derived: AccessGrant[] = [
      { sourceId: 'derived:team-hierarchy', actionId: 'activities:read', scope: 'team' },
      { sourceId: 'derived:team-hierarchy', actionId: 'activities:assign', scope: 'team' },
    ]
    captured.queries.length = 0
    const team = render(client, derived, 'team')
    expect(team).toContain('Agenda del equipo')
    expect(team).toContain('Personas del equipo')
    expect(rowsOf(team, 'Tarea de Ana')).toBe(1)
    expect(captured.queries.find(q => q.key === 'workflow-sellers')?.enabled).toBe(true)
  })
})
