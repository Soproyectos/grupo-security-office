import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../services/api', () => ({ default: { get } }))

import AssignedReportsPage from './AssignedReportsPage'
import {
  DASHBOARD_RESUME_QUERY_KEY,
} from '../services/dashboard-insights.service'
import type { MyWorkspace } from '../services/dashboard-insights.service'

/**
 * COM-05 frontend — AssignedReportsPage (reportes asignados del equipo).
 *
 * ✅ A2 (cliente): sin bloque `team` de la API → estado vacío honesto y CERO
 *    filas inventadas; con `team` se pintan sus miembros reales (nunca ajenos).
 * ✅ A1/A3 (cliente): columnas META y FACTURADO separadas (sin doble conteo)
 *    y la facturación con la etiqueta de fuente visible; mixedCurrency avisado.
 */

const SIN_EQUIPO: MyWorkspace = {
  scope: 'ASSIGNED',
  kpis: { listas: 0, products: 0, pendingPublication: 0, recentActivity: 0 },
  listas: [],
  recentActivity: [],
  commercial: {
    target: { amount: '10.00', currency: 'COP' },
    invoiced: {
      amount: '0.00',
      currency: 'COP',
      mixedCurrency: false,
      source: 'invoice-reference-manual',
      sourceStatus: 'erp-not-connected',
    },
    remaining: { amount: '10.00', currency: 'COP' },
    pipeline: { amount: '0.00', count: 0 },
    myCustomers: { total: 0, leads: 0, clientes: 0 },
    myQuotes: { borrador: 0, enviada: 0, negociacion: 0, ganada: 0, perdida: 0 },
  },
}

const CON_EQUIPO: MyWorkspace = {
  ...SIN_EQUIPO,
  team: {
    members: [
      {
        userId: 'u-ana',
        name: 'Ana Comercial',
        target: { amount: '900000.00', currency: 'COP' },
        invoiced: {
          amount: '450000.00',
          currency: 'COP',
          mixedCurrency: false,
          source: 'invoice-reference-manual',
          sourceStatus: 'erp-not-connected',
        },
        remaining: { amount: '450000.00', currency: 'COP' },
        pipeline: { amount: '100000.00', count: 1 },
        customers: { total: 2, leads: 1, clientes: 1 },
        quotesByStatus: { ganada: 4 },
      },
      {
        userId: 'u-beto',
        name: 'Beto Integrado',
        target: { amount: '500.00', currency: 'USD' },
        invoiced: {
          amount: '0.00',
          currency: 'USD',
          mixedCurrency: true,
          source: 'invoice-reference-manual',
          sourceStatus: 'erp-not-connected',
        },
        remaining: { amount: '500.00', currency: 'USD' },
        pipeline: { amount: '0.00', count: 0 },
        customers: { total: 0, leads: 0, clientes: 0 },
        quotesByStatus: {},
      },
    ],
    totals: {
      target: { amount: '900000.00', currency: 'COP', mixedCurrency: true },
      invoiced: {
        amount: '450000.00',
        currency: 'COP',
        mixedCurrency: true,
        source: 'invoice-reference-manual',
        sourceStatus: 'erp-not-connected',
      },
    },
  },
}

function render(page: ReactElement, resume?: MyWorkspace) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (resume) client.setQueryData(DASHBOARD_RESUME_QUERY_KEY, resume)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <page.type {...page.props} />
    </QueryClientProvider>,
  )
}

describe('AssignedReportsPage (COM-05)', () => {
  it('A2: sin bloque team la página muestra estado vacío honesto y CERO filas de miembros', () => {
    const html = render(<AssignedReportsPage />, SIN_EQUIPO)
    expect(html).toContain('Sin datos de equipo disponibles')
    expect(html).not.toContain('Ana Comercial')
    expect(html).not.toContain('Beto Integrado')
  })

  it('A1: columnas META y FACTURADO separadas — las ganadas no se mezclan en la facturación', () => {
    const html = render(<AssignedReportsPage />, CON_EQUIPO)
    expect(html).toContain('Meta')
    expect(html).toContain('Facturado')
    // Cifras de columnas distintas presentes y sin suma inventada (900000+450000=1350000)
    expect(html).toContain('900000.00')
    expect(html).toContain('450000.00')
    expect(html).not.toContain('1350000.00')
    expect(html).not.toMatch(/Ganadas[^<]*facturado/i)
  })

  it('A3: la facturación lleva la etiqueta de fuente y el mixedCurrency se avisa', () => {
    const html = render(<AssignedReportsPage />, CON_EQUIPO)
    expect(html).toContain('Referencia manual de factura')
    expect(html).toContain('ERP sin conectar')
    expect(html).not.toMatch(/sincroniz/i)
    expect(html).toMatch(/monedas/i)
  })

  it('A2: con equipo se pintan SOLO los miembros que trae la API', () => {
    const html = render(<AssignedReportsPage />, CON_EQUIPO)
    expect(html).toContain('Ana Comercial')
    expect(html).toContain('Beto Integrado')
    expect(html).not.toContain('Sin datos de equipo')
  })
})
