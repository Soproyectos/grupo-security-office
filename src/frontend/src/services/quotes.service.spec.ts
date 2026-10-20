import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('./api', () => ({ default: { get, post, patch, delete: del } }))

import {
  QuoteServiceError,
  addQuoteItem,
  fetchQuote,
  quoteErrorMessage,
  toQuoteItemPayload,
  updateQuoteItem,
  updateQuoteItemDiscount,
  updateQuoteItemDiscountInCache,
  updateQuoteStatus,
  updateQuoteStatusInCache,
} from './quotes.service'
import type { Quote, QuoteItem } from '../features/quotes/types/quote.types'

/**
 * COM-03 frontend — contrato de servidor que consume el navegador.
 *
 * ✅ ACEPTACIÓN 1 (lado cliente): el payload de la vía GENERAL de ítem NUNCA
 *    lleva `discountPct` (el tipo lo impide y el servicio lo retira): el
 *    servidor responde 400 `discount-not-allowed-in-general-edit`/`-in-add`
 *    si aparece, sin escritura parcial. El descuento viaja SOLO por
 *    `PATCH /:id/items/:itemId/discount` (operación sensible).
 * ✅ ACEPTACIÓN 2 (lado cliente): 403/404/409 de producto/tarifa ajeno se
 *    muestran con el mensaje del servidor TAL CUAL (errores tipados).
 * ✅ ACEPTACIÓN 3 (lado cliente): la doble `ganada` → 409 con el mensaje del
 *    servidor + UN refetch que trae el estado real (un solo pedido).
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
    ...over,
  }
}

const DETAIL_KEY = ['quotes', 'detail', QUOTE_ID]

function httpError(status: number, message?: string | string[]) {
  return { response: { status, data: message ? { statusCode: status, message } : {} } }
}

const networkError = () => Object.assign(new Error('Network Error'), { response: undefined })

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('vía general de ítem — payload SIN discountPct (COM-03 §5.1, lado cliente)', () => {
  it('updateQuoteItem hace PATCH a la ruta del ítem con { quantity } exacto', async () => {
    patch.mockResolvedValue({ data: quote() })

    await updateQuoteItem(QUOTE_ID, ITEM_ID, { quantity: 5 })

    expect(patch).toHaveBeenCalledWith(`/commercial/quotes/${QUOTE_ID}/items/${ITEM_ID}`, {
      quantity: 5,
    })
  })

  it('aunque el llamador coloque discountPct, el body sale SIN él (limpieza runtime)', async () => {
    patch.mockResolvedValue({ data: quote() })

    await updateQuoteItem(QUOTE_ID, ITEM_ID, {
      quantity: 5,
      discountPct: '25',
    } as unknown as Parameters<typeof updateQuoteItem>[2])

    const [, body] = vi.mocked(patch).mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ quantity: 5 })
    expect(body).not.toHaveProperty('discountPct')
  })

  it('toQuoteItemPayload retira discountPct de cualquier payload de ítem', () => {
    expect(toQuoteItemPayload({ quantity: 3, discountPct: '10' })).toEqual({ quantity: 3 })
    expect(
      toQuoteItemPayload({ productId: 'p-1', quantity: 1, discountPct: '0' }),
    ).toEqual({ productId: 'p-1', quantity: 1 })
    expect(toQuoteItemPayload({ quantity: 3 })).not.toHaveProperty('discountPct')
  })

  it('addQuoteItem hace POST { productId, quantity } sin discountPct (la línea nace con 0)', async () => {
    post.mockResolvedValue({ data: quote() })

    await addQuoteItem(QUOTE_ID, { productId: 'prod-1', quantity: 3 })

    expect(post).toHaveBeenCalledWith(`/commercial/quotes/${QUOTE_ID}/items`, {
      productId: 'prod-1',
      quantity: 3,
    })
  })

  it('el 400 del servidor (discount-not-allowed-in-general-edit) sale tipado y tal cual', async () => {
    patch.mockRejectedValue(
      httpError(
        400,
        'discount-not-allowed-in-general-edit: use PATCH /:id/items/:itemId/discount (quotes:discount)',
      ),
    )

    const failure = await updateQuoteItem(QUOTE_ID, ITEM_ID, { quantity: 5 }).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(QuoteServiceError)
    expect((failure as QuoteServiceError).code).toBe('invalid')
    expect((failure as QuoteServiceError).status).toBe(400)
    expect((failure as QuoteServiceError).message).toContain('discount-not-allowed-in-general-edit')
  })
})

describe('ACEPTACIÓN 2 (lado cliente) — producto/tarifa ajeno se pinta tal cual', () => {
  it('403 de Lista sin nivel view_prices → error tipado con el mensaje del servidor', async () => {
    post.mockRejectedValue(httpError(403, 'No tienes permisos suficientes sobre esta Lista'))

    const failure = await addQuoteItem(QUOTE_ID, { productId: 'prod-ajeno', quantity: 1 }).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(QuoteServiceError)
    expect((failure as QuoteServiceError).code).toBe('forbidden')
    expect(quoteErrorMessage(failure)).toBe('No tienes permisos suficientes sobre esta Lista')
  })

  it('404 de producto fuera de alcance → error tipado not-found con el mensaje tal cual', async () => {
    post.mockRejectedValue(httpError(404, 'Producto no encontrado'))

    const failure = await addQuoteItem(QUOTE_ID, { productId: 'prod-404', quantity: 1 }).catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('not-found')
    expect(quoteErrorMessage(failure)).toBe('Producto no encontrado')
  })

  it('409 de tarifa sin precio vigente → error tipado conflict citando el SKU (tal cual)', async () => {
    post.mockRejectedValue(
      httpError(409, 'El producto SKU-SIN-PRECIO no tiene precio vigente en la tarifa de la cotización'),
    )

    const failure = await addQuoteItem(QUOTE_ID, { productId: 'prod-precio', quantity: 1 }).catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('conflict')
    expect(quoteErrorMessage(failure)).toContain('SKU-SIN-PRECIO')
  })
})

describe('updateQuoteItemDiscount — endpoint dedicado (COM-03 §3)', () => {
  it('PATCH .../discount con { discountPct } exacto y devuelve la cotización', async () => {
    patch.mockResolvedValue({ data: quote() })

    const result = await updateQuoteItemDiscount(QUOTE_ID, ITEM_ID, '10')

    expect(patch).toHaveBeenCalledWith(
      `/commercial/quotes/${QUOTE_ID}/items/${ITEM_ID}/discount`,
      { discountPct: '10' },
    )
    expect(result.id).toBe(QUOTE_ID)
  })

  it('403 sin quotes:discount → error tipado con el mensaje del servidor TAL CUAL', async () => {
    patch.mockRejectedValue(
      httpError(403, 'Sin permiso quotes:discount sobre esta cotización (no-covering-grant)'),
    )

    const failure = await updateQuoteItemDiscount(QUOTE_ID, ITEM_ID, '10').catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(QuoteServiceError)
    expect((failure as QuoteServiceError).code).toBe('forbidden')
    expect((failure as QuoteServiceError).message).toBe(
      'Sin permiso quotes:discount sobre esta cotización (no-covering-grant)',
    )
    expect(quoteErrorMessage(failure)).toBe(
      'Sin permiso quotes:discount sobre esta cotización (no-covering-grant)',
    )
  })

  it('403 sin texto → reserva clara sobre la concesión quotes:discount (F1)', async () => {
    patch.mockRejectedValue(httpError(403))

    const failure = await updateQuoteItemDiscount(QUOTE_ID, ITEM_ID, '10').catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).message).toBe(
      'No tienes permiso para modificar descuentos (concesión quotes:discount pendiente)',
    )
  })

  it('400 fuera de rango → error tipado invalid con el mensaje del servidor', async () => {
    patch.mockRejectedValue(httpError(400, 'discountPct debe estar entre 0 y 100'))

    const failure = await updateQuoteItemDiscount(QUOTE_ID, ITEM_ID, '101').catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('invalid')
    expect((failure as QuoteServiceError).message).toBe('discountPct debe estar entre 0 y 100')
  })

  it('404 fuera de alcance/ítem ajeno → error tipado not-found con el mensaje tal cual', async () => {
    patch.mockRejectedValue(httpError(404, 'Cotización no encontrada'))

    const failure = await updateQuoteItemDiscount(QUOTE_ID, ITEM_ID, '10').catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('not-found')
    expect((failure as QuoteServiceError).message).toBe('Cotización no encontrada')
  })

  it('409 estado no itemable → error tipado conflict con el mensaje tal cual', async () => {
    patch.mockRejectedValue(
      httpError(409, "Los ítems no se pueden modificar en estado 'ganada'"),
    )

    const failure = await updateQuoteItemDiscount(QUOTE_ID, ITEM_ID, '10').catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('conflict')
    expect((failure as QuoteServiceError).message).toBe(
      "Los ítems no se pueden modificar en estado 'ganada'",
    )
  })
})

describe('updateQuoteStatus — transición inválida ahora es 409 (COM-03 §6/F7)', () => {
  it('doble ganada → error tipado conflict con el mensaje del servidor TAL CUAL', async () => {
    patch.mockRejectedValue(httpError(409, 'Ya existe un pedido para esta cotización'))

    const failure = await updateQuoteStatus(QUOTE_ID, { status: 'ganada' }).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(QuoteServiceError)
    expect((failure as QuoteServiceError).code).toBe('conflict')
    expect((failure as QuoteServiceError).status).toBe(409)
    expect((failure as QuoteServiceError).message).toBe(
      'Ya existe un pedido para esta cotización',
    )
    // Exactamente el texto que la página pinta en su alerta de estado.
    expect(quoteErrorMessage(failure)).toBe('Ya existe un pedido para esta cotización')
  })

  it('transición inválida de estado → conflict con «No se puede pasar de X a Y»', async () => {
    patch.mockRejectedValue(httpError(409, 'No se puede pasar de ganada a enviada'))

    const failure = await updateQuoteStatus(QUOTE_ID, { status: 'enviada' }).catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('conflict')
    expect((failure as QuoteServiceError).message).toBe('No se puede pasar de ganada a enviada')
  })

  it('perdida sin lostReason → 400 invalid con el mensaje tal cual', async () => {
    patch.mockRejectedValue(httpError(400, 'Perdida requiere lostReason'))

    const failure = await updateQuoteStatus(QUOTE_ID, { status: 'perdida' }).catch(
      (error: unknown) => error,
    )

    expect((failure as QuoteServiceError).code).toBe('invalid')
    expect((failure as QuoteServiceError).message).toBe('Perdida requiere lostReason')
  })

  it('200 → devuelve la cotización con el estado nuevo', async () => {
    patch.mockResolvedValue({ data: quote({ status: 'enviada' }) })

    const updated = await updateQuoteStatus(QUOTE_ID, { status: 'enviada' })

    expect(patch).toHaveBeenCalledWith(`/commercial/quotes/${QUOTE_ID}/status`, {
      status: 'enviada',
    })
    expect(updated.status).toBe('enviada')
  })
})

/**
 * Refetch de la caché compartida (patrón COM-02 `reassignCustomerInCache`):
 * la invalidación vive DENTRO de la mutación, así que se puede acreditar sin
 * DOM. La consulta se siembra con `fetchQuery` (react-query v5 no refetchea
 * entradas creadas solo con `setQueryData` cuando no hay observadores).
 */
async function seedDetail(data: Quote): Promise<QueryClient> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  get.mockResolvedValue({ data })
  await client.fetchQuery({ queryKey: DETAIL_KEY, queryFn: () => fetchQuote(data.id) })
  get.mockReset()
  return client
}

describe('refetch del detalle — una sola vez, sin duplicar (aceptaciones 1 y 3)', () => {
  it('descuento 200 → UN refetch del detalle (la fila se refresca una vez)', async () => {
    const client = await seedDetail(quote())
    patch.mockResolvedValue({ data: quote({ items: [item({ discountPct: '10' })] }) })
    get.mockResolvedValue({ data: quote({ items: [item({ discountPct: '10' })] }) })

    await updateQuoteItemDiscountInCache(client, {
      quoteId: QUOTE_ID,
      itemId: ITEM_ID,
      discountPct: '10',
    })

    expect(patch).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
    const after = client.getQueryData(DETAIL_KEY) as Quote
    expect(after.items?.[0]?.discountPct).toBe('10')
  })

  it('descuento 403 → SIN refetch: la caché queda como estaba y el error sale tipado', async () => {
    const client = await seedDetail(quote())
    patch.mockRejectedValue(
      httpError(403, 'Sin permiso quotes:discount sobre esta cotización (no-covering-grant)'),
    )

    const failure = await updateQuoteItemDiscountInCache(client, {
      quoteId: QUOTE_ID,
      itemId: ITEM_ID,
      discountPct: '10',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(QuoteServiceError)
    expect((failure as QuoteServiceError).message).toContain('quotes:discount')
    expect(get).not.toHaveBeenCalled()
    expect((client.getQueryData(DETAIL_KEY) as Quote).items?.[0]?.discountPct).toBe('15')
  })

  it('doble ganada 409 → mensaje del servidor + UN refetch con el estado real del servidor', async () => {
    const client = await seedDetail(quote({ status: 'enviada' }))
    patch.mockRejectedValue(httpError(409, 'Ya existe un pedido para esta cotización'))
    // El servidor ya tiene la cotización ganada con UN solo pedido: el refetch
    // es lo que hace que la interfaz muestre 1 pedido/estado, sin duplicados.
    get.mockResolvedValue({ data: quote({ status: 'ganada' }) })

    const failure = await updateQuoteStatusInCache(client, {
      quoteId: QUOTE_ID,
      payload: { status: 'ganada' },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(QuoteServiceError)
    expect(quoteErrorMessage(failure)).toBe('Ya existe un pedido para esta cotización')
    expect(get).toHaveBeenCalledTimes(1)
    expect((client.getQueryData(DETAIL_KEY) as Quote).status).toBe('ganada')
  })

  it('transición 400 (perdida sin motivo) → SIN refetch (nada cambió en el servidor)', async () => {
    const client = await seedDetail(quote({ status: 'enviada' }))
    patch.mockRejectedValue(httpError(400, 'Perdida requiere lostReason'))

    await expect(
      updateQuoteStatusInCache(client, { quoteId: QUOTE_ID, payload: { status: 'perdida' } }),
    ).rejects.toBeInstanceOf(QuoteServiceError)

    expect(get).not.toHaveBeenCalled()
  })

  it('transición 200 → UN refetch y la caché refleja el estado nuevo', async () => {
    const client = await seedDetail(quote({ status: 'borrador' }))
    patch.mockResolvedValue({ data: quote({ status: 'enviada' }) })
    get.mockResolvedValue({ data: quote({ status: 'enviada' }) })

    const updated = await updateQuoteStatusInCache(client, {
      quoteId: QUOTE_ID,
      payload: { status: 'enviada' },
    })

    expect(updated.status).toBe('enviada')
    expect(get).toHaveBeenCalledTimes(1)
    expect((client.getQueryData(DETAIL_KEY) as Quote).status).toBe('enviada')
  })
})

describe('quoteErrorMessage — texto que pinta la UI', () => {
  it('usa el mensaje del servidor cuando lo trae (400/403/404/409)', () => {
    expect(quoteErrorMessage(httpError(404, 'Cotización no encontrada'))).toBe(
      'Cotización no encontrada',
    )
    expect(
      quoteErrorMessage(httpError(409, 'No se puede pasar de ganada a enviada')),
    ).toBe('No se puede pasar de ganada a enviada')
    expect(
      quoteErrorMessage(
        httpError(403, 'Producto fuera de tu alcance'),
      ),
    ).toBe('Producto fuera de tu alcance')
  })

  it('403 sin texto → reserva clara sobre permisos (mensaje del servidor manda si existe)', () => {
    expect(quoteErrorMessage(httpError(403))).toMatch(/permiso/)
  })

  it('un message en array de class-validator se une en texto legible', () => {
    expect(quoteErrorMessage(httpError(400, ['quantity debe ser entero.', 'Revisar.']))).toBe(
      'quantity debe ser entero. Revisar.',
    )
  })

  it('la red caída (sin response) → fallback claro, sin romper la UI', () => {
    expect(quoteErrorMessage(networkError(), 'Intenta de nuevo')).toBe('Intenta de nuevo')
  })
})
