import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import PortalQuoteDraftPage, { ESTIMATE_CAPTION } from './PortalQuoteDraftPage'
import { PortalMyQuotesPage, PortalQuoteDetailPage } from './PortalMyQuotesPage'
import AccountStateNotice from '../components/AccountStateNotice'
import type { PortalAccount } from '../types/customer-portal.types'
import type { PortalQuoteDetail, PortalQuoteListItem } from '../types/portal-quotes.types'

const pricesMock = vi.hoisted(() => ({ signedIn: true, error: false, loading: false, prices: new Map<string, { value: number; currency: string }>(), quoteAccountId: 'a1' as string | undefined }))
const sendMock = vi.hoisted(() => ({ isPending: false, mutate: vi.fn() }))
const listQuery = vi.hoisted(() => ({ isPending: false, isError: false, isSuccess: true, data: [] as unknown[], refetch: vi.fn() }))
const detailQuery = vi.hoisted(() => ({ isPending: false, isError: false, isSuccess: true, data: undefined as unknown, refetch: vi.fn() }))

// renderToStaticMarkup reads the server snapshot (initial state) of a zustand store, so the list hook is fixed here.
const listMock = vi.hoisted(() => ({ items: [] as Array<{ productId: string; sku: string; name: string; imageUrl: string | null; quantity: number }> }))
vi.mock('../../../stores/portal-quote-list.store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../stores/portal-quote-list.store')>()),
  usePortalQuoteList: () => ({ items: listMock.items, count: listMock.items.length, add: vi.fn(), setQuantity: vi.fn(), remove: vi.fn(), clear: vi.fn() }),
}))
vi.mock('../../storefront/hooks/useAssignedProductPrices', () => ({ useAssignedProductPrices: () => pricesMock }))
vi.mock('../hooks/usePortalQuotes', () => ({
  useSendPortalQuote: () => sendMock,
  useMyQuotes: () => listQuery,
  useMyQuote: () => detailQuery,
  useMunicipalities: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}))

const ACCOUNT: PortalAccount = { id: 'a1', email: 'ana@example.com', type: 'FINAL_CUSTOMER', state: 'ACTIVE', contactName: 'Ana', companyName: 'Seguridad SAS', profileComplete: true }

function renderAt(path: string, route: string, element: React.ReactElement, account: PortalAccount = ACCOUNT, state?: unknown): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [{ pathname: path, state }] },
      createElement(Routes, null, createElement(Route, { element: createElement(Outlet, { context: account }) }, createElement(Route, { path: route, element }))),
    ),
  )
}

function seedList(items: Array<{ productId: string; sku: string; name: string; quantity: number }>) {
  listMock.items = items.map((item) => ({ ...item, imageUrl: null }))
}

beforeEach(() => {
  listMock.items = []
  pricesMock.prices = new Map()
  pricesMock.loading = false
  pricesMock.error = false
  sendMock.isPending = false
  listQuery.isPending = false
  listQuery.isError = false
  listQuery.isSuccess = true
  listQuery.data = []
  detailQuery.isPending = false
  detailQuery.isError = false
  detailQuery.isSuccess = true
})

describe('Mi cotización', () => {
  const draft = (account?: PortalAccount) => renderAt('/clientes/cotizacion', '/clientes/cotizacion', createElement(PortalQuoteDraftPage), account)

  it('vacía: explica qué hacer y lleva al catálogo', () => {
    const markup = draft()
    expect(markup).toContain('Tu cotización está vacía')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).not.toContain('Enviar a mi asesor')
  })

  it('con líneas: precio de su tarifa, «Precio por confirmar» y total solo con lo que tiene precio', () => {
    seedList([
      { productId: 'p1', sku: 'DS-1', name: 'Cámara Domo', quantity: 3 },
      { productId: 'p2', sku: 'DS-2', name: 'Grabador NVR', quantity: 2 },
    ])
    pricesMock.prices = new Map([['p1', { value: 100000, currency: 'COP' }]])
    const markup = draft()
    expect(markup).toContain('Cámara Domo')
    expect(markup).toContain('$ 100.000 c/u')
    expect(markup).toContain('$ 300.000')
    expect(markup).toContain('Precio por confirmar')
    expect(markup).toContain('1 producto tiene precio por confirmar y no suma al valor.')
    expect(markup).toContain(ESTIMATE_CAPTION)
    expect(markup).toContain('Enviar a mi asesor')
    expect(markup).toContain('maxLength="1000"')
    expect(markup).toContain('Quitar')
  })

  it('mientras carga los precios no afirma que falten', () => {
    seedList([{ productId: 'p1', sku: 'DS-1', name: 'Cámara Domo', quantity: 1 }])
    pricesMock.loading = true
    const markup = draft()
    expect(markup).toContain('Buscando tu precio')
    expect(markup).not.toContain('tiene precio por confirmar y no suma')
  })

  it('cuenta en revisión: avisa y no deja cotizar', () => {
    seedList([{ productId: 'p1', sku: 'DS-1', name: 'Cámara Domo', quantity: 1 }])
    const markup = draft({ ...ACCOUNT, state: 'PENDING' })
    expect(markup).toContain('Tu cuenta está en revisión. Un asesor te contactará pronto.')
    expect(markup).not.toContain('Enviar a mi asesor')
  })
})

describe('Avisos de la cuenta', () => {
  it('pendiente y asesor configurando la cuenta tienen su mensaje; una cuenta lista no muestra nada', () => {
    const render = (account: Pick<PortalAccount, 'state' | 'canQuote'>) => renderToStaticMarkup(createElement(AccountStateNotice, { account }))
    expect(render({ state: 'PENDING' })).toContain('Tu cuenta está en revisión. Un asesor te contactará pronto.')
    expect(render({ state: 'ACTIVE', canQuote: false })).toContain('Tu asesor está terminando de configurar tu cuenta')
    expect(render({ state: 'ACTIVE', canQuote: true })).toBe('')
    expect(render({ state: 'ACTIVE' })).toBe('')
  })
})

describe('Mis cotizaciones', () => {
  const rows: PortalQuoteListItem[] = [
    { id: 'q1', code: 'COT-0001', status: 'enviada', createdAt: '2026-11-20T15:00:00.000Z', issuedAt: '2026-11-20T15:00:00.000Z', total: 1190000, currency: 'COP', itemCount: 2, hasPendingPrices: true },
    { id: 'q2', code: 'COT-0002', status: 'negociacion', createdAt: '2026-11-21T15:00:00.000Z', issuedAt: null, total: 500000, currency: 'COP', itemCount: 1, hasPendingPrices: false },
    { id: 'q3', code: 'COT-0003', status: 'ganada', createdAt: '2026-11-22T15:00:00.000Z', issuedAt: null, total: 1, currency: 'COP', itemCount: 1, hasPendingPrices: false },
    { id: 'q4', code: 'COT-0004', status: 'perdida', createdAt: '2026-11-22T15:00:00.000Z', issuedAt: null, total: 1, currency: 'COP', itemCount: 1, hasPendingPrices: false },
    { id: 'q5', code: 'COT-0005', status: 'cancelada', createdAt: '2026-11-22T15:00:00.000Z', issuedAt: null, total: 1, currency: 'COP', itemCount: 1, hasPendingPrices: false },
    { id: 'q6', code: 'COT-0006', status: 'vencida', createdAt: '2026-11-22T15:00:00.000Z', issuedAt: null, total: 1, currency: 'COP', itemCount: 1, hasPendingPrices: false },
    { id: 'q7', code: 'COT-0007', status: 'borrador', createdAt: '2026-11-22T15:00:00.000Z', issuedAt: null, total: 1, currency: 'COP', itemCount: 1, hasPendingPrices: false },
  ]
  const list = () => renderAt('/clientes/cotizaciones', '/clientes/cotizaciones', createElement(PortalMyQuotesPage))

  it('lista con código, fecha, estado en español, total y aviso de precios por confirmar', () => {
    listQuery.data = rows
    const markup = list()
    for (const label of ['Enviada a tu asesor', 'En revisión', 'Aceptada', 'No concretada', 'Cancelada', 'Vencida', 'Borrador']) expect(markup).toContain(label)
    expect(markup).toContain('COT-0001')
    expect(markup).toContain('20/11/2026')
    expect(markup).toContain('$ 1.190.000')
    expect(markup).toContain('2 productos')
    expect(markup).toContain('Tiene precios por confirmar')
    expect(markup).toContain('href="/clientes/cotizaciones/q1"')
  })

  it('sin cotizaciones guía hacia el catálogo', () => {
    const markup = list()
    expect(markup).toContain('Aún no has enviado cotizaciones')
    expect(markup).toContain('href="/catalogo"')
  })

  it('mientras carga muestra un esqueleto y si falla ofrece reintentar', () => {
    listQuery.isPending = true
    listQuery.isSuccess = false
    expect(list()).toContain('Cargando tus cotizaciones')
    listQuery.isPending = false
    listQuery.isError = true
    expect(list()).toContain('Intentar de nuevo')
  })
})

describe('Detalle de una cotización', () => {
  const detail: PortalQuoteDetail = {
    id: 'q1', code: 'COT-0001', status: 'negociacion', createdAt: '2026-11-20T15:00:00.000Z', issuedAt: '2026-11-20T15:00:00.000Z', validUntil: null,
    notes: 'Entrega en Pereira', currency: 'COP', subtotal: 1000000, taxRate: 19, taxAmount: 190000, total: 1190000,
    advisor: { name: 'Laura Gómez' }, hasPendingPrices: true,
    items: [
      { id: 'i1', sku: 'DS-1', name: 'Cámara Domo', quantity: 2, currency: 'COP', unitPrice: 500000, lineTotal: 1000000 },
      { id: 'i2', sku: 'DS-2', name: 'Grabador NVR', quantity: 1, currency: 'COP', unitPrice: null, lineTotal: 0 },
    ],
    history: [
      { fromStatus: null, toStatus: 'enviada', createdAt: '2026-11-20T15:00:00.000Z', actor: 'Tú' },
      { fromStatus: 'enviada', toStatus: 'negociacion', createdAt: '2026-11-21T15:00:00.000Z', actor: 'Tu asesor' },
    ],
  }
  const show = (state?: unknown) => renderAt('/clientes/cotizaciones/q1', '/clientes/cotizaciones/:id', createElement(PortalQuoteDetailPage), ACCOUNT, state)

  it('muestra líneas, totales, asesor, precio por confirmar e historial con quién hizo cada cambio', () => {
    detailQuery.data = detail
    const markup = show()
    expect(markup).toContain('Cotización COT-0001')
    expect(markup).toContain('Tu asesor: Laura Gómez')
    expect(markup).toContain('En revisión')
    expect(markup).toContain('$ 500.000 c/u')
    expect(markup).toContain('Precio por confirmar')
    expect(markup).toContain('IVA incluido (19%)')
    expect(markup).toContain('$ 1.190.000')
    expect(markup).toContain('Entrega en Pereira')
    expect(markup).toContain('Enviada a tu asesor')
    expect(markup).toContain('Pasó de «Enviada a tu asesor» a «En revisión»')
    expect(markup).toContain('21/11/2026 · Tu asesor')
    expect(markup).toContain('20/11/2026 · Tú')
    expect(markup).not.toContain('Enviamos tu cotización')
  })

  it('al llegar desde el envío confirma que se envió', () => {
    detailQuery.data = detail
    expect(show({ sent: true })).toContain('Enviamos tu cotización COT-0001 a tu asesor.')
  })
})
