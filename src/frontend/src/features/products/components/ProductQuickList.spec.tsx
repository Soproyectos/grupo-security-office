import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductQuickList } from './ProductQuickList'
import { collectTariffColumns, mergeTariffColumns, priceForTariff } from '../lib/quick-list'
import type { Product } from '../types/product.types'

function price(code: string, name: string, value: number) {
  return { id: `${code}-${value}`, value, currency: 'COP', validFrom: null, validUntil: null, priceList: { id: code, name, code } }
}

function product(id: string, name: string, prices: ReturnType<typeof price>[]): Product {
  return { id, name, sku: `SKU-${id}`, images: [], prices } as unknown as Product
}

const catalog = [
  product('1', 'Cámara domo', [price('CLIENTE_FINAL_IVA', 'Cliente final', 210000), price('TIENDA_IVA', 'Tienda', 185000)]),
  product('2', 'Disco duro', [price('TIENDA_IVA', 'Tienda', 150000), price('REVENDEDOR', 'Revendedor', 140000)]),
]

describe('quick list helpers', () => {
  it('builds one column per tariff, known tariffs first and the rest by name', () => {
    expect(collectTariffColumns(catalog).map((column) => column.code)).toEqual(['TIENDA_IVA', 'CLIENTE_FINAL_IVA', 'REVENDEDOR'])
  })

  it('finds the price of a tariff and returns undefined when missing', () => {
    expect(priceForTariff(catalog[0]!, 'TIENDA_IVA')?.value).toBe(185000)
    expect(priceForTariff(catalog[0]!, 'REVENDEDOR')).toBeUndefined()
  })
})

describe('ProductQuickList', () => {
  it('shows name and SKU without photos and every tariff price per product', () => {
    const html = renderToStaticMarkup(<ProductQuickList products={catalog} onOpen={() => {}} />)
    expect(html).toContain('Cámara domo')
    expect(html).toContain('SKU-1')
    expect(html).not.toContain('<img')
    for (const label of ['Tienda', 'Cliente final', 'Revendedor']) expect(html).toContain(label)
    expect(html).toContain('185.000')
    expect(html).toContain('140.000')
  })

  it('leaves a missing price blank and separates Referencia from Nombre', () => {
    const html = renderToStaticMarkup(<ProductQuickList products={catalog} onOpen={() => {}} />)
    expect(html).not.toContain('—')
    expect(html).toContain('>Referencia<')
    expect(html).toContain('>Nombre<')
    expect(html.indexOf('>Referencia<')).toBeLessThan(html.indexOf('>Nombre<'))
    expect(html.indexOf('>Nombre<')).toBeLessThan(html.indexOf('>Tienda<'))
  })

  it('shows every tariff passed in, even when no product has a price for it', () => {
    const tariffs = mergeTariffColumns(
      [{ code: 'INSTALADOR_IVA', name: 'Instalador' }, { code: 'TIENDA_IVA', name: 'Tienda' }, { code: 'VIEJA', name: 'Vieja', isActive: false }],
      catalog,
    )
    expect(tariffs.map((column) => column.code)).toEqual(['INSTALADOR_IVA', 'TIENDA_IVA', 'CLIENTE_FINAL_IVA', 'REVENDEDOR'])
    const html = renderToStaticMarkup(<ProductQuickList products={catalog} tariffs={tariffs} onOpen={() => {}} />)
    expect(html).toContain('Instalador')
    expect(html).not.toContain('Vieja')
  })

  it('keeps Referencia and Nombre pinned while prices scroll sideways', () => {
    const html = renderToStaticMarkup(<ProductQuickList products={catalog} onOpen={() => {}} />)
    expect(html).toContain('sticky left-0')
    expect(html).toContain('sticky left-36')
  })

  it('renders a compact block per product for small screens with only the prices it has', () => {
    const html = renderToStaticMarkup(<ProductQuickList products={catalog} onOpen={() => {}} />)
    const mobile = html.slice(html.indexOf('<ul'))
    expect(mobile).toContain('md:hidden')
    expect(mobile).toContain('<dl')
    expect(mobile).toContain('Revendedor')
    expect((mobile.match(/<dt/g) ?? []).length).toBe(4)
  })

  it('shows a skeleton with a status role while loading, keeping the table shape', () => {
    const html = renderToStaticMarkup(<ProductQuickList products={[]} isLoading tariffs={[{ code: 'TIENDA_IVA', name: 'Tienda' }]} onOpen={() => {}} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Cargando productos')
    expect(html).toContain('animate-pulse')
  })

  it('shows loading and empty messages', () => {
    expect(renderToStaticMarkup(<ProductQuickList products={[]} isLoading onOpen={() => {}} />)).toContain('Cargando')
    expect(renderToStaticMarkup(<ProductQuickList products={[]} emptyMessage="Sin resultados" onOpen={() => {}} />)).toContain('Sin resultados')
  })
})
