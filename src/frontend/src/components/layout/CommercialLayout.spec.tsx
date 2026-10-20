import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommercialLayout from './CommercialLayout'
import { userAccessKey } from '../../features/users/access'
import { useAuthStore } from '../../stores/auth.store'
import type { UserAccessState } from '../../services/users.service'

function login() {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles: ['Consulta'], permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}
function render(path: string, grants?: UserAccessState['grants']) {
  const client = new QueryClient()
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [], packages: [] })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/commercial" element={<CommercialLayout />}>
      <Route path="products" element={<p>DATOS-PRODUCTOS</p>} />
      <Route path="customers" element={<p>DATOS-CLIENTES</p>} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(login)
describe('paneles separados con acceso individual', () => {
  it('Catálogo muestra Biblioteca y Listas sin mezclar Clientes', () => {
    const html = render('/commercial/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'listas:read', scope: 'global' },
      { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
    ])
    expect(html).toContain('Catálogo y precios')
    expect(html).toContain('Biblioteca de productos')
    expect(html).toContain('href="/commercial/lists"')
    expect(html).not.toContain('href="/commercial/customers"')
    expect(html).toContain('DATOS-PRODUCTOS')
  })
  it('Comercial muestra Clientes sin mezclar Biblioteca', () => {
    const html = render('/commercial/customers', [{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }])
    expect(html).toContain('href="/commercial/customers"')
    expect(html).not.toContain('href="/commercial/products"')
    expect(html).toContain('DATOS-CLIENTES')
  })
  it('sin asignaciones no monta datos internos', () => {
    const html = render('/commercial/products', [])
    expect(html).toContain('Sin paneles asignados')
    expect(html).not.toContain('DATOS-PRODUCTOS')
  })
  it('mientras espera el acceso tampoco monta datos internos', () => {
    const html = render('/commercial/products')
    expect(html).not.toContain('DATOS-PRODUCTOS')
    expect(html).not.toContain('href="/commercial/products"')
  })
})
