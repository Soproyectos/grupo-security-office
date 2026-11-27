import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AddQuoteItemModal from './AddQuoteItemModal'
import type { Quote } from '../types/quote.types'

/**
 * COM-03 frontend — alta de línea SIN descuento (aceptación 1, lado cliente).
 *
 * ✅ El modal NO ofrece campo de descuento: la línea nace con `discountPct` 0
 *    en el servidor y aplicar descuento es la operación dedicada
 *    `PATCH /:id/items/:itemId/discount` (COM-03 §3). El payload que se envía
 *    es `{ productId, quantity }` — sin `discountPct` (el 400
 *    `discount-not-allowed-in-add` del servidor no puede ocurrir desde esta UI).
 * ✅ El «409 sin precio vigente» y demás errores siguen pintándose con el
 *    mensaje del servidor (se acredita en quotes.service.spec.ts).
 */

const QUOTE: Quote = {
  id: 'q-1',
  code: 'COT-0001',
  customerId: 'cust-1',
  ownerId: 'owner-1',
  listaId: null,
  priceListId: 'pl-1',
  status: 'borrador',
  currency: 'COP',
  subtotal: '0',
  discount: '0',
  taxRate: '19',
  taxAmount: '0',
  total: '0',
  validUntil: null,
  issuedAt: null,
  closedAt: null,
  lostReason: null,
  notes: null,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  items: [],
}

function seededClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AddQuoteItemModal open onClose={() => {}} quote={QUOTE} />
    </QueryClientProvider>,
  )
}

let client: QueryClient

beforeEach(() => {
  client = seededClient()
})

describe('AddQuoteItemModal — alta sin descuento (COM-03 §3)', () => {
  it('NO ofrece campo de descuento en el alta', () => {
    const html = render(client)

    expect(html).not.toContain('name="discount-pct"')
    expect(html).not.toContain('Descuento')
    expect(html).not.toMatch(/discount/i)
  })

  it('busca productos por nombre o SKU (sin Listas) y ofrece cantidad — lo único que se envía', () => {
    const html = render(client)

    expect(html).toContain('Buscar producto')
    expect(html).toContain('Busca por nombre o SKU')
    expect(html).not.toContain('Buscar en la lista')
    expect(html).toContain('name="quantity"')
    expect(html).toContain('Agregar')
  })
})
