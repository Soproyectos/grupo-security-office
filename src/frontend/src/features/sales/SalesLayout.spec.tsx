import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import SalesLayout from './SalesLayout'

describe('seller navigation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'seller-demo', name: 'Vendedor de prueba', email: 'seller@example.invalid', roles: ['Vendedor'], permissions: [] },
    })
  })

  it('shows sales tools without the commercial administration window', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/sales']}><SalesLayout /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(html).toContain('Mi espacio de ventas')
    expect(html).toContain('href="/sales/customers"')
    expect(html).toContain('href="/sales/quotes"')
    expect(html).toContain('href="/catalogo"')
    expect(html).not.toContain('/commercial')
    expect(html).not.toContain('Comercial')
    expect(html).not.toContain('Configuración')
    expect(html).not.toContain('Usuarios')
    expect(html).not.toContain('Auditoría')
  })
})
