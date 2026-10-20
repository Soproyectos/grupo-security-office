import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuoteDetailPage from './QuoteDetailPage'
import { useAuthStore } from '../stores/auth.store'
import type { Quote, QuoteItem } from '../features/quotes/types/quote.types'
import type { SalesOrder } from '../features/quotes/types/sales-order.types'

/**
 * COM-03 frontend — QuoteDetailPage (render de servidor con caché sembrada,
 * el repo no tiene entorno DOM: patrón CustomersPage/ListaDetailPage). Los
 * envíos de payload y los errores 400/403/404/409 con su refetch viven en
 * `services/quotes.service.spec.ts`; aquí se acredita lo que la interfaz
 * MUESTRA y lo que NO ofrece.
 *
 * ✅ ACEPTACIÓN 1 (lado cliente): el descuento del ítem es SOLO LECTURA sin
 *    el criterio documentado (`features/quotes/access.ts`); con él (y en
 *    estado editable) sí se ofrece el editor. El gate de ESTADO se conserva:
 *    en `ganada` no se edita nada.
 * ✅ ACEPTACIÓN 3 (lado cliente): el detalle de una cotización ganada muestra
 *    UN estado y UN pedido (sin duplicados) y no ofrece transiciones desde
 *    estado terminal.
 */

const QUOTE_ID = 'q-1'
const ITEM_ID = 'item-1'

function item(over: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: ITEM_ID,
    quoteId: QUOTE_ID,
    position: 1,
    productId: 'prod-1',
    priceId: 'price-1',
    sku: 'SKU-COM03',
    name: 'Producto COM03',
    listaId: 'lista-1',
    priceListId: 'pl-1',
    unitPrice: '100000',
    currency: 'COP',
    quantity: 2,
    discountPct: '15',
    lineTotal: '170000',
    priceCapturedAt: '2026-10-16T00:00:00.000Z',
    ...over,
  }
}

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: QUOTE_ID,
    code: 'COT-0001',
    customerId: 'cust-1',
    ownerId: 'owner-1',
    listaId: 'lista-1',
    priceListId: 'pl-1',
    status: 'borrador',
    currency: 'COP',
    subtotal: '170000',
    discount: '0',
    taxRate: '19',
    taxAmount: '32300',
    total: '202300',
    validUntil: null,
    issuedAt: null,
    closedAt: null,
    lostReason: null,
    notes: null,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    items: [item()],
    customer: { id: 'cust-1', code: 'CL-0001', name: 'Cliente COM03', status: 'LEAD' },
    lista: { id: 'lista-1', code: 'L-1', name: 'Lista COM03', currency: 'COP' },
    priceList: { id: 'pl-1', code: 'PL-1', name: 'Tarifa COM03', currency: 'COP' },
    owner: { id: 'owner-1', name: 'Responsable COM03', email: 'owner@fixture.test' },
    ...over,
  }
}

function salesOrder(over: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'so-1',
    code: 'SO-0001',
    quoteId: QUOTE_ID,
    customerId: 'cust-1',
    ownerId: 'owner-1',
    total: '202300',
    currency: 'COP',
    externalInvoiceNumber: null,
    externalInvoiceDate: null,
    externalSystem: 'manual',
    notes: null,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    quote: { id: QUOTE_ID, code: 'COT-0001', status: 'ganada' },
    ...over,
  }
}

function login(roles: string[]) {
  const session = {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      name: 'Usuario de prueba',
      email: 'user@example.invalid',
      roles,
      permissions: [],
    },
  }
  useAuthStore.setState(session)
  // zustand v5 usa `getInitialState()` como server snapshot: el render de
  // servidor (este repo no tiene entorno DOM) lee la sesión de ahí.
  Object.assign(useAuthStore.getInitialState(), session)
}

function seeded(quoteData: Quote, orders: SalesOrder[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['quotes', 'detail', QUOTE_ID], quoteData)
  client.setQueryData(
    ['salesOrders', 'byQuote', QUOTE_ID, quoteData.customerId],
    {
      data: orders,
      meta: { total: orders.length, skip: 0, take: 100, totalPages: 1 },
    },
  )
  return client
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/commercial/quotes/${QUOTE_ID}`]}>
        <Routes>
          <Route path="/commercial/quotes/:id" element={<QuoteDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const occurrences = (html: string, text: string) => html.split(text).length - 1

beforeEach(() => {
  login(['Super Admin'])
})

describe('ACEPTACIÓN 1 (lado cliente) — descuento solo editable con criterio', () => {
  it('Super Admin en estado editable: la columna Dto. ofrece el editor (y Cant. también)', () => {
    const html = render(seeded(quote()))

    expect(html).toContain('aria-label="Descuento de Producto COM03"')
    expect(html).toContain('aria-label="Cantidad de Producto COM03"')
    expect(html).not.toContain('15%')
  })

  it('Vendedor en estado editable: Cant. editable pero descuento SOLO LECTURA (15%)', () => {
    login(['Vendedor'])
    const html = render(seeded(quote()))

    expect(html).toContain('aria-label="Cantidad de Producto COM03"')
    expect(html).not.toContain('aria-label="Descuento de')
    expect(html).toContain('15%')
  })

  it('gate de ESTADO conservado: en ganada no se edita nada (ni cantidad ni descuento)', () => {
    const html = render(seeded(quote({ status: 'ganada' }), [salesOrder()]))

    expect(html).not.toContain('aria-label="Cantidad de')
    expect(html).not.toContain('aria-label="Descuento de')
    expect(html).toContain('15%')
  })
})

describe('ACEPTACIÓN 3 (lado cliente) — ganada con UN pedido, sin duplicados', () => {
  it('detalle ganada con un pedido → un solo código de pedido y un solo estado Ganada', () => {
    const html = render(seeded(quote({ status: 'ganada' }), [salesOrder()]))

    expect(occurrences(html, 'SO-0001')).toBe(1)
    expect(occurrences(html, 'Ganada')).toBe(1)
    expect(html).toContain('Pedido')
    expect(html).toContain('Cotización COT-0001')
  })

  it('el pedido existe pero su factura externa sigue vacía (registro manual, sin factura inventada)', () => {
    const html = render(seeded(quote({ status: 'ganada' }), [salesOrder()]))

    expect(html).toContain('Factura externa (N°)')
    expect(html).toContain('Fecha de factura')
    // La factura es solo registro manual (Yéminus): la UI muestra el campo
    // vacío y NUNCA un número de factura que no venga del servidor.
    expect(html).not.toContain('YM-')
    expect(occurrences(html, 'SO-0001')).toBe(1)
  })

  it('estado terminal NO ofrece transiciones (no hay botones que re-disparen una ganada)', () => {
    const html = render(seeded(quote({ status: 'ganada' }), [salesOrder()]))

    expect(html).not.toContain('Marcar como ganada')
    expect(html).not.toContain('Marcar como enviada')
    expect(html).not.toContain('Acciones de estado')
  })
})
