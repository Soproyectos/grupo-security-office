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
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [] })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/commercial" element={<CommercialLayout />}>
      <Route path="products" element={<p>DATOS-PRODUCTOS</p>} />
      <Route path="library/update" element={<p>DATOS-PRECIOS</p>} />
      <Route path="library/update/products" element={<p>DATOS-FICHAS</p>} />
      <Route path="library/update/import" element={<p>DATOS-IMPORTACIONES</p>} />
      <Route path="library/masters" element={<p>DATOS-MAESTROS</p>} />
      <Route path="customers" element={<p>DATOS-CLIENTES</p>} />
      <Route path="portal" element={<p>DATOS-SOLICITUDES</p>} />
      <Route path="zones" element={<p>DATOS-ZONAS</p>} />
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
    ])
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
  // «Ver productos» (products:read) abre Productos y también es un requisito de Fichas y Precios.
  it.each([
    ['solo Fichas', ['products:read', 'products:write', 'prices:read'], ['href="/commercial/products"', 'href="/commercial/library/update/products"'], ['href="/commercial/library/update"']],
    ['solo Precios', ['products:read', 'prices:read', 'prices:preview'], ['href="/commercial/products"', 'href="/commercial/library/update"'], ['href="/commercial/library/update/products"']],
    ['solo Productos', ['products:read', 'prices:read'], ['href="/commercial/products"'], ['href="/commercial/library/update']],
    ['Fichas y Precios', ['products:read', 'products:write', 'prices:read', 'prices:preview'], ['href="/commercial/products"', 'href="/commercial/library/update/products"', 'href="/commercial/library/update"'], []],
    ['Fichas sin ver productos', ['products:write'], ['href="/commercial/library/update/products"'], ['href="/commercial/products"', 'href="/commercial/library/update"']],
  ])('la navegación muestra solo las pestañas asignadas: %s', (_name, actionIds, shown, hidden) => {
    const grants: UserAccessState['grants'] = actionIds.map((actionId) => ({ sourceId: 's1', actionId, scope: 'global' }))
    const html = render('/commercial/products', grants)
    for (const href of shown) expect(html).toContain(href)
    for (const href of hidden) expect(html).not.toContain(href)
  })
  it('Importaciones y Catálogos maestros aparecen en el menú solo con su concesión', () => {
    const both = render('/commercial/library/masters', [
      { sourceId: 's1', actionId: 'imports:read', scope: 'global' },
      { sourceId: 's2', actionId: 'masters:read', scope: 'global' },
    ])
    expect(both).toContain('href="/commercial/library/update/import"')
    expect(both).toContain('Importaciones</a>')
    expect(both).toContain('href="/commercial/library/masters"')
    expect(both).toContain('Catálogos maestros</a>')
    expect(both).toContain('DATOS-MAESTROS')

    const onlyImports = render('/commercial/library/update/import', [{ sourceId: 's1', actionId: 'imports:read', scope: 'global' }])
    expect(onlyImports).toContain('href="/commercial/library/update/import"')
    expect(onlyImports).not.toContain('href="/commercial/library/masters"')
    expect(onlyImports).toContain('DATOS-IMPORTACIONES')
  })
  it('quien solo tiene Fichas o Productos no ve las pestañas nuevas por pertenecer a Biblioteca', () => {
    const html = render('/commercial/library/update/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
    ])
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
  it('Comercial usa el mismo diseño de pestañas que Biblioteca, con ayuda de la pestaña activa', () => {
    const html = render('/commercial/customers', [{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }])
    expect(html).toContain('biblioteca-workspace__bar')
    expect(html).toContain('>Comercial</h1>')
    expect(html).toContain('aria-label="Navegación de Comercial"')
    expect(html).toContain('Los clientes que puedes consultar.')
    expect(html).toMatch(/aria-current="page"[^>]*href="\/commercial\/customers"/)
  })
  it('Solicitudes aparece con portalAccounts:read, con su ayuda, y no trae Zonas ni Clientes', () => {
    const html = render('/commercial/portal', [{ sourceId: 's1', actionId: 'portalAccounts:read', scope: 'team' }])
    expect(html).toContain('href="/commercial/portal"')
    expect(html).toContain('Solicitudes</a>')
    expect(html).toContain('Cuentas creadas en la tienda: aprobar, asesor, cliente vinculado y tarifa.')
    expect(html).toMatch(/aria-current="page"[^>]*href="\/commercial\/portal"/)
    expect(html).toContain('DATOS-SOLICITUDES')
    expect(html).not.toContain('href="/commercial/zones"')
    expect(html).not.toContain('href="/commercial/customers"')
  })
  it('Zonas aparece solo con portalZones:manage; con solo ver cuentas no se pinta', () => {
    const onlyAccounts = render('/commercial/portal', [{ sourceId: 's1', actionId: 'portalAccounts:read', scope: 'global' }])
    expect(onlyAccounts).not.toContain('Zonas</a>')
    const zones = render('/commercial/zones', [
      { sourceId: 's1', actionId: 'portalAccounts:read', scope: 'global' },
      { sourceId: 's1', actionId: 'portalZones:manage', scope: 'global' },
    ])
    expect(zones).toContain('href="/commercial/zones"')
    expect(zones).toContain('Zonas</a>')
    expect(zones).toContain('Ciudades que reparten los registros nuevos entre asesores.')
    expect(zones).toContain('DATOS-ZONAS')
  })
  it('un vendedor sin acciones del portal no ve Solicitudes ni Zonas', () => {
    const html = render('/commercial/customers', [
      { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
      { sourceId: 's1', actionId: 'quotes:read', scope: 'own' },
    ])
    expect(html).toContain('href="/commercial/customers"')
    expect(html).not.toContain('href="/commercial/portal"')
    expect(html).not.toContain('href="/commercial/zones"')
  })
  it('Promociones internas y Gestionar avisos ya no aparecen en Comercial, ni siquiera para quien tiene sus acciones', () => {
    const html = render('/commercial/customers', [
      { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
      { sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' },
      { sourceId: 's1', actionId: 'commercialPromotions:create', scope: 'team' },
    ])
    expect(html).toContain('href="/commercial/customers"')
    for (const href of ['/sales/promotions', '/promotions', '/marketing/promotions', '/marketing/notices']) expect(html).not.toContain(`href="${href}"`)
    expect(html).not.toContain('Promociones internas')
    expect(html).not.toContain('Gestionar avisos')
  })
  it('Super Admin ve todas las pestañas de Comercial en orden, con Solicitudes tras Clientes y Zonas al final', () => {
    const admin = { user: { id: 'u1', name: 'Admin', email: 'a@example.invalid', roles: ['Super Admin'], permissions: [] } }
    useAuthStore.setState(admin)
    Object.assign(useAuthStore.getInitialState(), admin)
    const html = render('/commercial/customers', [])
    const order = ['/commercial/customers', '/commercial/portal', '/commercial/quotes', '/targets', '/reports', '/commercial/zones']
    const positions = order.map((href) => html.indexOf(`href="${href}"`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(html).not.toContain('Promociones internas')
    expect(html).not.toContain('Gestionar avisos')
  })
  it('quien tiene Fichas y Precios ve también Productos, porque ver productos es su propia acción', () => {
    const html = render('/commercial/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
      { sourceId: 's1', actionId: 'prices:preview', scope: 'global' },
    ])
    expect(html).toContain('Fichas</a>')
    expect(html).toContain('Precios</a>')
    expect(html).toContain('href="/commercial/products"')
    expect(html).toContain('DATOS-PRODUCTOS')
    expect(html).not.toMatch(/paquete/i)
  })
  it('consulta no muestra destinos de edición, carga masiva ni publicación', () => {
    const html = render('/commercial/products', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
    ])
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
    ])
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
