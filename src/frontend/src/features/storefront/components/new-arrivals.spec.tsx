import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { loadNewArrivals, NewArrivalsView } from './NewArrivals'
import type { PublicProductResult } from '../types/publicProduct'

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('../../../services/public-catalog.service', () => ({ fetchPublicProducts: fetchMock }))

function product(over: Partial<PublicProductResult> = {}): PublicProductResult {
  return {
    id: 'p1', sku: 'DS-2CD1023', name: 'Cámara bala 2 MP', imageUrl: null, categoryName: 'Cámaras',
    categorySlug: 'camaras', brandName: 'Hikvision', isInformational: false,
    price: { value: 120000 },
    ...over,
  } as PublicProductResult
}

const render = (products: PublicProductResult[]) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(NewArrivalsView, { products })))

beforeEach(() => fetchMock.mockReset())

describe('Novedades en el catálogo', () => {
  it('pide los 4 más recientes', async () => {
    fetchMock.mockResolvedValue({ items: [product()], total: 1, offset: 0, limit: 4 })
    await loadNewArrivals()
    expect(fetchMock).toHaveBeenCalledWith({ sort: 'recent' }, 0, 4)
  })

  it('salta los productos informativos', async () => {
    fetchMock.mockResolvedValue({ items: [product(), product({ id: 'p2', isInformational: true })], total: 2, offset: 0, limit: 4 })
    expect((await loadNewArrivals()).map((p) => p.id)).toEqual(['p1'])
  })

  it('devuelve lista vacía si falla la carga', async () => {
    fetchMock.mockRejectedValueOnce(new Error('red'))
    expect(await loadNewArrivals()).toEqual([])
  })

  it('muestra marca, nombre y referencia en un enlace a la ficha, sin precio ni Cotizar', () => {
    const markup = render([product()])
    expect(markup).toContain('id="home-new-title"')
    expect(markup).toContain('Novedades en el catálogo')
    expect(markup).toContain('Ver todo')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).toContain('Hikvision')
    expect(markup).toContain('Cámara bala 2 MP')
    expect(markup).toContain('DS-2CD1023')
    expect(markup).toContain('href="/catalogo/productos/p1"')
    expect(markup).not.toContain('Cotizar')
    expect(markup).not.toContain('$')
    expect(markup).not.toContain('IVA')
  })

  it('no renderiza nada sin productos', () => {
    expect(render([])).toBe('')
  })
})
