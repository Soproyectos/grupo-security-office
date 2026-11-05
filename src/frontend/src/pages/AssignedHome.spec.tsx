import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MemoryRouter } from 'react-router-dom'

const COMMERCIAL_ACTIONS = ['targets:read', 'quotes:read', 'teamInsights:read']
const { get, panels } = vi.hoisted(() => ({
  get: vi.fn(),
  panels: {
    status: 'ready' as 'ready' | 'loading',
    commercial: true,
    catalog: true,
    actions: ['targets:read', 'quotes:read', 'teamInsights:read'],
  },
}))
vi.mock('../services/api', () => ({ default: { get } }))
vi.mock('../features/users/access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/users/access')>()),
  useOwnUserAccess: () => ({
    access: { grants: panels.actions.map((actionId) => ({ sourceId: 's1', actionId, scope: 'global' })) },
    status: panels.status,
    refetch: vi.fn(),
  }),
  usePanelAccess: (panel: 'commercial' | 'catalog') => {
    const on = panel === 'commercial' ? panels.commercial : panels.catalog
    return {
      tabs: on && panel === 'catalog' ? [{ to: '/commercial/products', label: 'Productos', end: false, actionId: 'products:read' }] : [],
      hasAnyPanel: on,
      gated: true,
    }
  },
}))

import AssignedHome from './AssignedHome'
import {
  DASHBOARD_GOAL_QUERY_KEY,
  DASHBOARD_LIBRARY_STATS_QUERY_KEY,
  DASHBOARD_RESUME_QUERY_KEY,
} from '../services/dashboard-insights.service'
import type { LibraryStats, MyWorkspace, PersonalSalesGoal } from '../services/dashboard-insights.service'

/**
 * COM-05 frontend — AssignedHome («Mi resumen» asignado, datos REALES con
 * fuente visible; sin ejemplos ficticios — ficha regla 2).
 *
 * ✅ A1 (cliente): «Facturado» pinta SOLO `invoiced`; las ganadas son
 *    contador de oportunidades por separado (nunca sumadas).
 * ✅ A3 (cliente): toda cifra de facturación lleva la etiqueta de fuente
 *    («Referencia manual · ERP sin conectar»), incluido el cero.
 * ✅ A2 (cliente): el bloque de equipo se pinta SOLO si la API lo devuelve;
 *    sin él no hay rastro de datos de equipo en el DOM.
 */

const GOAL: PersonalSalesGoal = {
  period: '2026-10',
  target: { amount: '180000000.00', currency: 'COP' },
  invoiced: {
    amount: '100.00',
    currency: 'COP',
    mixedCurrency: false,
    source: 'invoice-reference-manual',
    sourceStatus: 'erp-not-connected',
  },
  remaining: { amount: '179999900.00', currency: 'COP' },
  progressPercent: 0.1,
}

const RESUME_SIN_EQUIPO: MyWorkspace = {
  scope: 'ASSIGNED',
  kpis: { listas: 2, products: 8, pendingPublication: 1, recentActivity: 4 },
  listas: [],
  recentActivity: [],
  commercial: {
    target: null,
    invoiced: {
      amount: '100.00',
      currency: 'COP',
      mixedCurrency: false,
      source: 'invoice-reference-manual',
      sourceStatus: 'erp-not-connected',
    },
    remaining: null,
    pipeline: { amount: '500000.00', count: 2 },
    myCustomers: { total: 5, leads: 2, clientes: 3 },
    myQuotes: { borrador: 1, enviada: 2, negociacion: 1, ganada: 3, perdida: 1 },
  },
}

const RESUME_CON_EQUIPO: MyWorkspace = {
  ...RESUME_SIN_EQUIPO,
  team: {
    members: [
      {
        userId: 'u-com',
        name: 'Comercial Equipo',
        target: { amount: '900000.00', currency: 'COP' },
        invoiced: {
          amount: '0.00',
          currency: 'COP',
          mixedCurrency: false,
          source: 'invoice-reference-manual',
          sourceStatus: 'erp-not-connected',
        },
        remaining: { amount: '900000.00', currency: 'COP' },
        pipeline: { amount: '0.00', count: 0 },
        customers: { total: 1, leads: 0, clientes: 1 },
        quotesByStatus: {},
      },
    ],
    totals: {
      target: { amount: '900000.00', currency: 'COP', mixedCurrency: false },
      invoiced: {
        amount: '0.00',
        currency: 'COP',
        mixedCurrency: false,
        source: 'invoice-reference-manual',
        sourceStatus: 'erp-not-connected',
      },
    },
  },
}

const LIBRARY_ALL: LibraryStats = {
  products: {
    total: 120,
    published: 80,
    draft: 30,
    archived: 10,
    withoutImage: 7,
    withoutPrice: 5,
    topCategories: [{ name: 'Categoria Demo', count: 40 }],
  },
  update: {
    unvalidated: 11,
    notUpdated30Days: 22,
    pendingPriceRevisions: 3,
    lastPriceRevisionAppliedAt: '2026-10-20T12:00:00.000Z',
    jobsQueued: 1,
    jobsRunning: 2,
  },
  publication: {
    pending: 9,
    withIssues: 4,
    published: 80,
    latestPublished: [{ name: 'Producto Demo Uno', publishedAt: '2026-10-25T12:00:00.000Z' }],
  },
}

function render(
  home: ReactElement,
  seed: { goal?: PersonalSalesGoal; resume?: MyWorkspace; library?: LibraryStats },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seed.goal) client.setQueryData(DASHBOARD_GOAL_QUERY_KEY, seed.goal)
  if (seed.resume) client.setQueryData(DASHBOARD_RESUME_QUERY_KEY, seed.resume)
  if (seed.library) client.setQueryData(DASHBOARD_LIBRARY_STATS_QUERY_KEY, seed.library)
  return renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <home.type {...home.props} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AssignedHome (COM-05)', () => {
  beforeEach(() => {
    Object.assign(panels, { status: 'ready', commercial: true, catalog: true, actions: [...COMMERCIAL_ACTIONS] })
  })

  it('A1: Facturado pinta SOLO invoiced; ganadas son contador de oportunidades aparte', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO })
    // La cifra facturada es la de invoiced (100.00); la suma engañosa 100+3 no existe.
    expect(html).toContain('100.00')
    expect(html).not.toContain('103.00')
    // Contador de ganadas etiquetado como oportunidad, no como facturación
    expect(html).toMatch(/Ganadas[^<]*oportunidad/i)
    expect(html).toMatch(/Oportunidades abiertas/)
    expect(html).not.toMatch(/Facturado[^<]*Ganadas/)
  })

  it('A3: la cifra de facturación lleva la etiqueta honesta de fuente (ERP sin conectar)', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO })
    expect(html).toContain('Referencia manual de factura')
    expect(html).toContain('ERP sin conectar')
    expect(html).not.toMatch(/sincroniz/i)
  })

  it('A3: el cero facturado se pinta CON la marca de fuente (cero ≠ sin etiqueta)', () => {
    const html = render(<AssignedHome />, {
      goal: {
        ...GOAL,
        invoiced: { ...GOAL.invoiced, amount: '0.00' },
      },
      resume: RESUME_SIN_EQUIPO,
    })
    expect(html).toContain('0.00')
    expect(html).toContain('Referencia manual de factura')
    expect(html).toContain('ERP sin conectar')
  })

  it('A2: sin team en la API no hay rastro de datos de equipo en el DOM', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO })
    expect(html).not.toMatch(/aria-label="Equipo"/)
    expect(html).not.toContain('Comercial Equipo')
  })

  it('no expone el KPI heredado de Listas en el resumen', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO })
    expect(html).not.toContain('Listas:')
    // Los contadores de catálogo ya no viven en Actividad: los reemplazan las estadísticas de Biblioteca.
    expect(html).not.toContain('Productos: 8')
    expect(html).not.toContain('Pendientes de publicación')
    expect(html).toContain('Actividad reciente: 4')
  })

  it('Compras (solo panel de Biblioteca): ninguna sección comercial ni de actividad', () => {
    Object.assign(panels, { commercial: false, catalog: true, actions: [] })
    const html = render(<AssignedHome />, {
      goal: GOAL,
      resume: RESUME_CON_EQUIPO,
      library: { products: LIBRARY_ALL.products },
    })
    expect(html).toContain('Biblioteca · Productos')
    for (const hidden of ['Facturación y meta', 'Cotizaciones y oportunidades', 'aria-label="Actividad"', 'aria-label="Equipo"']) {
      expect(html).not.toContain(hidden)
    }
  })

  it('cada bloque comercial exige su propia acción', () => {
    Object.assign(panels, { actions: ['quotes:read'] })
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_CON_EQUIPO })
    expect(html).toContain('Cotizaciones y oportunidades')
    expect(html).not.toContain('Facturación y meta')
    expect(html).not.toContain('aria-label="Equipo"')
  })

  it('A2: con team en la API se pinta el miembro y el total con su fuente', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_CON_EQUIPO })
    expect(html).toMatch(/aria-label="Equipo"/)
    expect(html).toContain('Comercial Equipo')
    expect(html).toContain('Referencia manual de factura')
  })
  it('estadísticas de Biblioteca: sin secciones en la respuesta no se pinta nada', () => {
    const empty = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO, library: {} })
    const missing = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO })
    for (const html of [empty, missing]) {
      expect(html).not.toContain('Estadísticas de')
    }
  })

  it('estadísticas de Biblioteca: solo se pinta la sección que devuelve la API', () => {
    const html = render(<AssignedHome />, {
      goal: GOAL,
      resume: RESUME_SIN_EQUIPO,
      library: { products: LIBRARY_ALL.products },
    })
    expect(html).toContain('Estadísticas de Productos')
    expect(html).toContain('Biblioteca · Productos')
    expect(html).toContain('Total de productos')
    expect(html).toContain('Necesitan atención')
    expect(html).toContain('href="/commercial/products"')
    expect(html).not.toContain('Categoria Demo')
    expect(html).not.toContain('Estadísticas de Fichas')
    expect(html).not.toContain('Estadísticas de Publicación')
  })

  it('aviso: sin ningún panel se explica que no tiene paneles asignados', () => {
    Object.assign(panels, { status: 'ready', commercial: false, catalog: false })
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO, library: {} })
    expect(html).toContain('No tienes paneles asignados.')
    expect(html).not.toContain('no tiene estadísticas habilitadas')
    Object.assign(panels, { status: 'ready', commercial: true, catalog: true })
  })

  it('aviso: con panel de Biblioteca pero sin casilla de estadísticas se dice que no están habilitadas', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO, library: {} })
    expect(html).toContain('Tu panel de Biblioteca no tiene estadísticas habilitadas.')
    expect(html).not.toContain('No tienes paneles asignados.')
  })

  it('aviso: con estadísticas habilitadas no aparece ningún aviso', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO, library: { products: LIBRARY_ALL.products } })
    expect(html).not.toContain('No tienes paneles asignados.')
    expect(html).not.toContain('no tiene estadísticas habilitadas')
  })

  it('aviso: mientras carga el acceso o las estadísticas no se muestra ningún aviso', () => {
    Object.assign(panels, { status: 'loading', commercial: false, catalog: false })
    const loadingAccess = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO, library: {} })
    Object.assign(panels, { status: 'ready', commercial: true, catalog: true })
    const loadingStats = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO })
    for (const html of [loadingAccess, loadingStats]) {
      expect(html).not.toContain('No tienes paneles asignados.')
      expect(html).not.toContain('no tiene estadísticas habilitadas')
    }
  })

  it('estadísticas de Biblioteca: con las tres claves se pintan las tres secciones', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_SIN_EQUIPO, library: LIBRARY_ALL })
    expect(html).toContain('Estadísticas de Productos')
    expect(html).toContain('Estadísticas de Fichas')
    expect(html).toContain('Estadísticas de Publicación')
    expect(html).toContain('Fichas sin validar')
    expect(html).toContain('Producto Demo Uno')
    expect(html).toContain('Cotizaciones y oportunidades')
  })
})
