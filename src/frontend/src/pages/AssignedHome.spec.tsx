import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../services/api', () => ({ default: { get } }))

import AssignedHome from './AssignedHome'
import {
  DASHBOARD_GOAL_QUERY_KEY,
  DASHBOARD_RESUME_QUERY_KEY,
} from '../services/dashboard-insights.service'
import type { MyWorkspace, PersonalSalesGoal } from '../services/dashboard-insights.service'

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

function render(home: ReactElement, seed: { goal?: PersonalSalesGoal; resume?: MyWorkspace }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seed.goal) client.setQueryData(DASHBOARD_GOAL_QUERY_KEY, seed.goal)
  if (seed.resume) client.setQueryData(DASHBOARD_RESUME_QUERY_KEY, seed.resume)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <home.type {...home.props} />
    </QueryClientProvider>,
  )
}

describe('AssignedHome (COM-05)', () => {
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

  it('A2: con team en la API se pinta el miembro y el total con su fuente', () => {
    const html = render(<AssignedHome />, { goal: GOAL, resume: RESUME_CON_EQUIPO })
    expect(html).toMatch(/aria-label="Equipo"/)
    expect(html).toContain('Comercial Equipo')
    expect(html).toContain('Referencia manual de factura')
  })
})
