import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('./api', () => ({ default: { get, post } }))

import {
  SalesTargetServiceError,
  fetchMemberInvoiced,
  fetchPersonalSalesGoal,
  fetchMyWorkspace,
  fetchSalesTargets,
  invoiceSourceLabel,
  salesTargetErrorMessage,
  upsertSalesTarget,
  upsertSalesTargetInCache,
  type SalesTargetRow,
  type SalesTargetUpsertPayload,
} from './dashboard-insights.service'

/**
 * COM-04 frontend — superficie de metas por integrante/periodo consumida desde
 * el navegador (`GET`/`POST /api/commercial/sales-targets`).
 *
 * ✅ ACEPTACIÓN 1 (lado cliente): el 403 del servidor se envuelve tipado con
 *    su MENSAJE TAL CUAL (`salesTargetErrorMessage`), que la UI pinta; el
 *    navegador no decide reglas de alcance.
 * ✅ ACEPTACIÓN 2 (lado cliente): tras upsert hay UN refetch de la caché (sin
 *    append local); el upsert es idempotente por (userId, period) en el
 *    servidor, así que N reintentos idénticos dejan 1 fila tras el refetch.
 * ✅ ACEPTACIÓN 3 (lado cliente): `fetchMemberInvoiced` lee la fuente REAL del
 *    avance facturado (`/dashboard/team/:userId`, mes en curso) y devuelve SOLO
 *    `invoiced` — meta (`SalesTarget.amount`) y avance son medidas separadas y
 *    jamás se mezclan en un mismo campo.
 */

const ROW: SalesTargetRow = {
  id: 't-1',
  userId: 'u-vendedor',
  period: '2026-10-01T00:00:00.000Z',
  amount: '250000000',
  currency: 'COP',
  notes: 'Meta COM-04',
  setById: 'u-admin',
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  user: { id: 'u-vendedor', name: 'Vendedor Fixture', email: 'vendedor.fixture@test' },
  setBy: { id: 'u-admin', name: 'Administrador' },
}

const PAYLOAD: SalesTargetUpsertPayload = {
  userId: 'u-vendedor',
  period: '2026-10',
  amount: '250000000',
  currency: 'COP',
  notes: 'Meta COM-04',
}

function httpError(status: number, message?: string | string[]) {
  return { response: { status, data: message ? { statusCode: status, message } : {} } }
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ data: [ROW] })
  post.mockResolvedValue({ data: ROW })
})

describe('fetchSalesTargets — GET /commercial/sales-targets', () => {
  it('sin parámetros consulta el endpoint base (alcance por defecto del servidor)', async () => {
    const rows = await fetchSalesTargets()

    expect(get).toHaveBeenCalledWith('/commercial/sales-targets')
    expect(rows).toEqual([ROW])
  })

  it('userId/from/to viajan como query string', async () => {
    await fetchSalesTargets({ userId: 'u-vendedor', from: '2026-10', to: '2026-10' })

    expect(get).toHaveBeenCalledWith(
      '/commercial/sales-targets?userId=u-vendedor&from=2026-10&to=2026-10',
    )
  })
})

describe('upsertSalesTarget — POST /commercial/sales-targets (moneda obligatoria)', () => {
  it('envía el payload tipado con currency y devuelve la fila persistida', async () => {
    const row = await upsertSalesTarget(PAYLOAD)

    expect(post).toHaveBeenCalledWith('/commercial/sales-targets', PAYLOAD)
    expect(row.id).toBe('t-1')
    expect(row.currency).toBe('COP')
  })

  it('el TIPO exige currency: COP/USD/EUR (compila como literal; sin default en cliente)', () => {
    const explicit: SalesTargetUpsertPayload = { ...PAYLOAD, currency: 'USD' }
    expect(explicit.currency).toBe('USD')
    // @ts-expect-error — moneda fuera del catálogo del contrato no compila
    const invalid: SalesTargetUpsertPayload = { ...PAYLOAD, currency: 'MXN' }
    expect(invalid.currency).toBe('MXN')
  })
})

describe('errores tipados 400/401/403 con el mensaje del servidor (ACEPTACIÓN 1)', () => {
  it('403 → error tipado forbidden con el mensaje del servidor TAL CUAL', async () => {
    const serverMessage = 'Sin permiso targets:edit sobre esta meta (no-covering-grant)'
    post.mockRejectedValue(httpError(403, serverMessage))

    await expect(upsertSalesTarget(PAYLOAD)).rejects.toBeInstanceOf(SalesTargetServiceError)
    await expect(upsertSalesTarget(PAYLOAD)).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
      message: serverMessage,
    })
  })

  it('salesTargetErrorMessage devuelve el mensaje del 403 (lo que la UI pinta)', async () => {
    const serverMessage = 'Solo puedes consultar tu propia meta'
    post.mockRejectedValue(httpError(403, serverMessage))

    const error = await upsertSalesTarget(PAYLOAD).catch((e: unknown) => e)
    expect(salesTargetErrorMessage(error)).toBe(serverMessage)
  })

  it('400 de moneda inválida → invalid con el mensaje del servidor', async () => {
    post.mockRejectedValue(
      httpError(400, 'Moneda no permitida. Use una de: COP, USD, EUR'),
    )

    await expect(upsertSalesTarget(PAYLOAD)).rejects.toMatchObject({
      code: 'invalid',
      status: 400,
      message: 'Moneda no permitida. Use una de: COP, USD, EUR',
    })
  })

  it('401 sin sesión → unauthorized con reserva clara', async () => {
    post.mockRejectedValue(httpError(401))

    await expect(upsertSalesTarget(PAYLOAD)).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    })
    const error = await upsertSalesTarget(PAYLOAD).catch((e: unknown) => e)
    expect(salesTargetErrorMessage(error)).toContain('sesión')
  })
})

describe('upsertSalesTargetInCache — refetch único sin duplicar filas (ACEPTACIÓN 2)', () => {
  it('doble submit idéntico: 2 POST, 1 refetch por submit y la caché sigue con 1 fila', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    client.setQueryData(['sales-targets', ''], [ROW])

    await upsertSalesTargetInCache(client, PAYLOAD)
    await upsertSalesTargetInCache(client, PAYLOAD)

    expect(post).toHaveBeenCalledTimes(2)
    // Sin append local: la fila vive en el servidor; cada submit refetchea UNA vez.
    expect(invalidate).toHaveBeenCalledTimes(2)
    const cached = client.getQueryData<SalesTargetRow[]>(['sales-targets', ''])
    expect(cached).toHaveLength(1)
    expect(cached?.[0]?.id).toBe('t-1')
  })

  it('un 403 no toca la caché (la lista sigue mostrando lo que el servidor autoriza)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    client.setQueryData(['sales-targets', ''], [ROW])
    post.mockRejectedValue(httpError(403, 'Sin permiso targets:edit sobre esta meta'))

    await expect(upsertSalesTargetInCache(client, PAYLOAD)).rejects.toBeInstanceOf(
      SalesTargetServiceError,
    )

    expect(invalidate).not.toHaveBeenCalled()
    expect(client.getQueryData<SalesTargetRow[]>(['sales-targets', ''])).toHaveLength(1)
  })
})

describe('fetchMemberInvoiced — avance facturado SEPARADO de la meta (ACEPTACIÓN 3)', () => {
  it('lee /dashboard/team/:userId (fuente real SalesOrder) y devuelve SOLO invoiced', async () => {
    get.mockResolvedValue({
      data: {
        target: { amount: '250000000.00', currency: 'COP' },
        invoiced: { amount: '45000000.00', currency: 'COP', mixedCurrency: false },
        remaining: { amount: '205000000.00', currency: 'COP' },
      },
    })

    const invoiced = await fetchMemberInvoiced('u-vendedor')

    expect(get).toHaveBeenCalledWith('/dashboard/team/u-vendedor')
    // La UI de metas NUNCA usa `target` de esta fuente: la meta vive en
    // SalesTarget (GET/POST sales-targets); aquí solo entra el avance.
    expect(invoiced).toEqual({ amount: '45000000.00', currency: 'COP', mixedCurrency: false })
    expect(invoiced).not.toHaveProperty('amount-target')
  })
})

// ─── COM-05 frontend — resumen con fuente visible (RED: funciones aún inexistentes) ───
describe('COM-05 — fetchPersonalSalesGoal / fetchMyWorkspace / invoiceSourceLabel', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('fetchPersonalSalesGoal llama a /dashboard/sales-goal y devuelve el payload plano', async () => {
    const payload = {
      period: '2026-10',
      target: { amount: '180000000.00', currency: 'COP' },
      invoiced: {
        amount: '0.00',
        currency: 'COP',
        mixedCurrency: false,
        source: 'invoice-reference-manual',
        sourceStatus: 'erp-not-connected',
      },
      remaining: { amount: '180000000.00', currency: 'COP' },
      progressPercent: 0,
    }
    get.mockResolvedValue({ data: payload })
    const goal = await fetchPersonalSalesGoal()
    expect(get).toHaveBeenCalledWith('/dashboard/sales-goal')
    expect(goal.invoiced.source).toBe('invoice-reference-manual')
    expect(goal.invoiced.sourceStatus).toBe('erp-not-connected')
  })

  it('fetchMyWorkspace llama a /dashboard/me y conserva commercial/team opcionales', async () => {
    const payload = {
      scope: 'ASSIGNED',
      kpis: { listas: 1, products: 2, pendingPublication: 0, recentActivity: 3 },
      listas: [],
      recentActivity: [],
      commercial: {
        invoiced: {
          amount: '0.00',
          currency: 'COP',
          mixedCurrency: false,
          source: 'invoice-reference-manual',
          sourceStatus: 'erp-not-connected',
        },
      },
      // sin `team`: la API omite el bloque cuando no hay teamInsights:read
    }
    get.mockResolvedValue({ data: payload })
    const ws = await fetchMyWorkspace()
    expect(get).toHaveBeenCalledWith('/dashboard/me')
    expect(ws.commercial).toBeDefined()
    expect(ws.team).toBeUndefined()
  })

  it('invoiceSourceLabel distingue «ERP sin conectar» de la referencia base', () => {
    expect(
      invoiceSourceLabel({
        amount: '0.00',
        currency: 'COP',
        mixedCurrency: false,
        source: 'invoice-reference-manual',
        sourceStatus: 'erp-not-connected',
      }),
    ).toContain('ERP sin conectar')
    expect(
      invoiceSourceLabel({
        amount: '10.00',
        currency: 'COP',
        mixedCurrency: false,
        source: 'invoice-reference-manual',
        sourceStatus: 'connected',
      }),
    ).toBe('Referencia manual de factura')
    // Regla 1: la etiqueta jamás promete sincronización Yéminus
    expect(
      invoiceSourceLabel({
        amount: '0.00',
        currency: 'COP',
        mixedCurrency: false,
        source: 'invoice-reference-manual',
        sourceStatus: 'erp-not-connected',
      }),
    ).not.toMatch(/sincroniz/i)
  })
})
