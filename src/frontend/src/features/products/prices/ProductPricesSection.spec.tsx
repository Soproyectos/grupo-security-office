import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth.store'
import type { Product } from '../types/product.types'
import type { Price, PriceList } from '../../../services/prices.service'
import { ProductPriceForm, ProductPricesSection } from './ProductPricesSection'

const product = { id: 'p1', sku: 'SKU-1', name: 'Producto prueba' } as Product
const price: Price = {
  id: 'pr1', productId: 'p1', priceListId: 'pl1', value: 1500, currency: 'COP',
  validFrom: null, validUntil: null, createdAt: '', updatedAt: '',
  priceList: { id: 'pl1', name: 'Tarifa comercio', code: 'COMERCIO', currency: 'COP' },
}
const priceLists: PriceList[] = [{
  id: 'pl1', name: 'Tarifa comercio', code: 'COMERCIO', currency: 'COP', isActive: true, validFrom: null, validUntil: null,
}]

function renderSection(mode: 'editable' | 'readOnly', permissions: string[], roles = ['Operador']) {
  const session = {
    isAuthenticated: true,
    user: { id: 'u1', name: 'Tester', email: 'test@example.invalid', roles, permissions },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
  const client = new QueryClient()
  client.setQueryData(['product-prices', product.id], [price])
  client.setQueryData(['priceLists'], priceLists)
  return renderToStaticMarkup(<QueryClientProvider client={client}><ProductPricesSection product={product} mode={mode} /></QueryClientProvider>)
}

beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState()))

describe('ProductPricesSection', () => {
  it('muestra acciones solo con Fichas y Precios asignadas (lectura, escritura de productos y aplicación de precios)', () => {
    const html = renderSection('editable', ['prices:read', 'products:write', 'prices:apply'])
    expect(html).toContain('Tarifa comercio')
    expect(html).toContain('>Nuevo precio</button>')
    expect(html).toContain('>Editar</button>')
    expect(html).toContain('>Eliminar</button>')
  })

  it('solo Fichas (precios de solo lectura) o solo Precios sin Fichas: sin controles y con la explicación', () => {
    for (const permissions of [['prices:read', 'products:write'], ['prices:read', 'prices:apply']]) {
      const html = renderSection('editable', permissions)
      expect(html).toContain('Tarifa comercio')
      expect(html).not.toContain('Nuevo precio')
      expect(html).not.toContain('>Editar</button>')
      expect(html).not.toContain('>Eliminar</button>')
      expect(html).toContain('pestañas Fichas y Precios')
    }
  })

  it('mantiene consulta y publicación sin controles mutables incluso con permisos de superadmin', () => {
    const html = renderSection('readOnly', [], ['Super Admin'])
    expect(html).toContain('Tarifa comercio')
    expect(html).not.toContain('Nuevo precio')
    expect(html).not.toContain('>Editar</button>')
    expect(html).not.toContain('>Eliminar</button>')
  })

  it('oculta las mutaciones si falta prices:apply aunque tenga los otros permisos', () => {
    const html = renderSection('editable', ['prices:read', 'products:write'])
    expect(html).toContain('Tarifa comercio')
    expect(html).not.toContain('Nuevo precio')
    expect(html).not.toContain('>Editar</button>')
    expect(html).toContain('Para editar precios aquí necesitas tener asignadas las pestañas Fichas y Precios')
  })

  it('requiere prices:read para consultar el precio', () => {
    const html = renderSection('editable', ['products:write', 'prices:apply'])
    expect(html).toContain('No tienes permiso para consultar los precios')
    expect(html).not.toContain('Tarifa comercio')
  })

  it('el formulario solicita tarifa, valor y vigencias con hora local', () => {
    const session = {
      isAuthenticated: true,
      user: { id: 'u1', name: 'Tester', email: 'test@example.invalid', roles: ['Operador'], permissions: ['prices:read', 'products:write', 'prices:apply'] },
    }
    useAuthStore.setState(session)
    Object.assign(useAuthStore.getInitialState(), session)
    const client = new QueryClient()
    client.setQueryData(['priceLists'], priceLists)
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><ProductPriceForm mode="create" product={product} onClose={() => undefined} onSaved={() => undefined} /></QueryClientProvider>)

    expect(html).toContain('id="price-list"')
    expect(html).toContain('id="price-value"')
    expect(html).toContain('id="price-currency"')
    expect(html).toContain('id="price-valid-from" type="datetime-local"')
    expect(html).toContain('id="price-valid-until" type="datetime-local"')
    expect(html).toContain('Tarifa comercio (COMERCIO)')
  })
})
