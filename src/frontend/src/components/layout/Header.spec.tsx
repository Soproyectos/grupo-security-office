import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from './Header'
import { userAccessKey } from '../../features/users/access'
import { useAuthStore } from '../../stores/auth.store'
import type { AccessGrant } from '../../services/users.service'

beforeEach(() => {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles: ['Admin Comercial'], permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
})
function render(grants?: AccessGrant[], packageIds: string[] = []) {
  const client = new QueryClient()
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [], packages: packageIds.map((id) => ({ id, name: id, selections: [], applied: true, sourceId: id })) })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><Header /></MemoryRouter></QueryClientProvider>)
}
describe('menú principal por trabajo asignado', () => {
  it('sin asignaciones conserva herramientas personales sin enlaces administrativos', () => {
    const html = render([])
    expect(html).toContain('Mi resumen')
    expect(html).toContain('Agenda')
    expect(html).not.toContain('Panel Comercial')
    expect(html).not.toContain('>Biblioteca<')
    expect(html).not.toContain('href="/users"')
  })
  it('Marketing y mercadeo aparece solo con el panel asignado y marketing:read global', () => {
    const read: AccessGrant = { sourceId: 's1', actionId: 'marketing:read', scope: 'global' }
    const shown = render([read], ['marketing-consulta'])
    expect(shown).toContain('Marketing y mercadeo')
    expect(shown).toContain('href="/marketing"')
    expect(render([{ sourceId: 's1', actionId: 'marketing:edit', scope: 'global' }], ['marketing-edicion'])).not.toContain('Marketing y mercadeo')
    expect(render([])).not.toContain('Marketing y mercadeo')
  })
  it('una acción de marketing suelta, sin el panel asignado, no muestra el ítem', () => {
    expect(render([{ sourceId: 's1', actionId: 'marketing:read', scope: 'global' }])).not.toContain('Marketing y mercadeo')
    expect(render([{ sourceId: 's1', actionId: 'marketing:read', scope: 'global' }], ['biblioteca-consulta'])).not.toContain('Marketing y mercadeo')
  })
  it('el mismo cargo puede recibir solo Catálogo o solo Comercial', () => {
    const catalog = render([{ sourceId: 's1', actionId: 'products:write', scope: 'global' }], ['biblioteca-fichas'])
    expect(catalog).toContain('>Biblioteca<')
    expect(catalog).toContain('href="/commercial/library/update/products"')
    expect(render([{ sourceId: 's1', actionId: 'listas:read', scope: 'list', resourceId: 'l1' }])).not.toContain('>Biblioteca<')
    expect(catalog).not.toContain('Panel Comercial')
    const commercial = render([{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }])
    expect(commercial).toContain('Panel Comercial')
    expect(commercial).not.toContain('>Biblioteca<')
  })
  it('Productos y búsqueda aparecen solo con el paquete de consulta', () => {
    const html = render([{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], ['biblioteca-consulta'])
    expect(html).toContain('>Biblioteca<')
    expect(html).toContain('href="/commercial/products"')
    expect(html).toContain('Buscar productos, categorías, marcas...')
    const update = render([
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
    ], ['biblioteca-fichas'])
    expect(update).toContain('href="/commercial/library/update/products"')
    expect(update).not.toContain('href="/commercial/products"')
    expect(update).not.toContain('Buscar productos, categorías, marcas...')
    const prices = render([
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'prices:read', scope: 'global' },
      { sourceId: 's1', actionId: 'prices:preview', scope: 'global' },
    ], ['biblioteca-precios'])
    expect(prices).toContain('>Biblioteca<')
    expect(prices).toContain('href="/commercial/library/update"')
    expect(prices).not.toContain('href="/commercial/library/update/products"')
    expect(prices).not.toContain('Buscar productos, categorías, marcas...')
    const publication = render([
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:publish', scope: 'global' },
    ], ['biblioteca-publicacion'])
    // Publicar en tienda es un complemento: sin Fichas no abre ninguna pestaña.
    expect(publication).not.toContain('href="/catalog-management/publication"')
    expect(publication).not.toContain('href="/commercial/products"')
  })
  it('esperar la consulta no muestra accesos heredados del cargo', () => {
    const html = render()
    expect(html).not.toContain('Panel Comercial')
    expect(html).not.toContain('>Biblioteca<')
  })
})
