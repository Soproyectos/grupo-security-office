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
function render(path: string, grants?: UserAccessState['grants'], packageIds: string[] = []) {
  const client = new QueryClient()
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [], packages: packageIds.map((id) => ({ id, name: id, selections: [], applied: true, sourceId: id })) })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/commercial" element={<CommercialLayout />}>
      <Route path="products" element={<p>DATOS-PRODUCTOS</p>} />
      <Route path="library/update" element={<p>DATOS-PRECIOS</p>} />
      <Route path="library/update/products" element={<p>DATOS-FICHAS</p>} />
      <Route path="library/update/import" element={<p>DATOS-IMPORTACIONES</p>} />
      <Route path="library/masters" element={<p>DATOS-MAESTROS</p>} />
      <Route path="customers" element={<p>DATOS-CLIENTES</p>} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(login)
describe('paneles separados con acceso individual', () => {
  it('Biblioteca expone Productos, Fichas y Precios desde sus tres asignaciones sin mezclar Clientes', () => {
    const html = render('/commercial/library/update', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
      { sourceId: 's1', actionId: 'prices:preview', scope: 'global' },
      { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
    ], ['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios'])
    expect(html).toContain('>Biblioteca</h1>')
    expect(html).toContain('>Productos<')
    expect(html).toContain('href="/commercial/products"')
    expect(html).toContain('Fichas</a>')
    expect(html).toContain('Precios</a>')
    expect(html).toContain('href="/commercial/library/update/products"')
    expect(html).toContain('href="/commercial/library/update"')
    expect(html).not.toContain('href="/commercial/lists"')
    expect(html).not.toContain('href="/commercial/customers"')
    expect(html).toContain('DATOS-PRECIOS')
  })
  it.each([
    ['solo Fichas', ['biblioteca-fichas'], ['href="/commercial/library/update/products"'], ['href="/commercial/products"', 'href="/commercial/library/update"']],
    ['solo Precios', ['biblioteca-precios'], ['href="/commercial/library/update"'], ['href="/commercial/products"', 'href="/commercial/library/update/products"']],
    ['solo Productos', ['biblioteca-consulta'], ['href="/commercial/products"'], ['href="/commercial/library/update']],
    ['Fichas y Precios', ['biblioteca-fichas', 'biblioteca-precios'], ['href="/commercial/library/update/products"', 'href="/commercial/library/update"'], ['href="/commercial/products"']],
  ])('la navegación muestra solo las pestañas asignadas: %s', (_name, packageIds, shown, hidden) => {
    const grantsFor: Record<string, string[]> = {
      'biblioteca-consulta': ['products:read', 'prices:read'],
      'biblioteca-fichas': ['products:read', 'products:write', 'prices:read'],
      'biblioteca-precios': ['products:read', 'prices:read', 'prices:preview'],
    }
    const grants: UserAccessState['grants'] = [...new Set(packageIds.flatMap((id) => grantsFor[id] ?? []))]
      .map((actionId) => ({ sourceId: 's1', actionId, scope: 'global' }))
    const html = render('/commercial/products', grants, packageIds)
    for (const href of shown) expect(html).toContain(href)
    for (const href of hidden) expect(html).not.toContain(href)
  })
  it('Importaciones y Catálogos maestros aparecen en el menú solo con su concesión', () => {
    const both = render('/commercial/library/masters', [
      { sourceId: 's1', actionId: 'imports:read', scope: 'global' },
      { sourceId: 's2', actionId: 'masters:read', scope: 'global' },
    ], ['biblioteca-importaciones', 'biblioteca-maestros'])
    expect(both).toContain('href="/commercial/library/update/import"')
    expect(both).toContain('Importaciones</a>')
    expect(both).toContain('href="/commercial/library/masters"')
    expect(both).toContain('Catálogos maestros</a>')
    expect(both).toContain('DATOS-MAESTROS')

    const onlyImports = render('/commercial/library/update/import', [{ sourceId: 's1', actionId: 'imports:read', scope: 'global' }], ['biblioteca-importaciones'])
    expect(onlyImports).toContain('href="/commercial/library/update/import"')
    expect(onlyImports).not.toContain('href="/commercial/library/masters"')
    expect(onlyImports).toContain('DATOS-IMPORTACIONES')
  })
  it('quien solo tiene Fichas o Productos no ve las pestañas nuevas por pertenecer a Biblioteca', () => {
    const html = render('/commercial/library/update/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
    ], ['biblioteca-consulta', 'biblioteca-fichas'])
    expect(html).not.toContain('href="/commercial/library/update/import"')
    expect(html).not.toContain('href="/commercial/library/masters"')
    expect(html).not.toContain('Importaciones</a>')
    expect(html).not.toContain('Catálogos maestros</a>')
  })
  it('Comercial muestra Clientes sin mezclar Biblioteca', () => {
    const html = render('/commercial/customers', [{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }])
    expect(html).toContain('href="/commercial/customers"')
    expect(html).not.toContain('href="/commercial/products"')
    expect(html).toContain('DATOS-CLIENTES')
  })
  it('el paquete anterior Actualización conserva Fichas y Precios, pero no agrega Productos por el products:read dependiente', () => {
    const html = render('/commercial/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
      { sourceId: 's1', actionId: 'prices:preview', scope: 'global' },
    ], ['biblioteca-actualizacion'])
    expect(html).toContain('Fichas</a>')
    expect(html).toContain('Precios</a>')
    expect(html).not.toContain('href="/commercial/products"')
    expect(html).toContain('DATOS-PRODUCTOS')
  })
  it('consulta no muestra destinos de edición, carga masiva ni publicación', () => {
    const html = render('/commercial/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
    ], ['biblioteca-consulta'])
    expect(html).toContain('href="/commercial/products"')
    expect(html).not.toContain('href="/commercial/library/update')
    expect(html).not.toContain('href="/catalog-management/publication"')
    expect(html).toContain('Catálogo global de consulta')
    expect(html).not.toContain('pestaña Fichas')
  })
  it('el aviso de Productos menciona la pestaña Fichas solo a quien la tiene', () => {
    const html = render('/commercial/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
    ], ['biblioteca-consulta', 'biblioteca-fichas'])
    expect(html).toContain('Las fichas se editan en la pestaña Fichas.')
    expect(html).not.toContain('Actualización')
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
