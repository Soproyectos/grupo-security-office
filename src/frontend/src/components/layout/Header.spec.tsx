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
function render(grants?: AccessGrant[]) {
  const client = new QueryClient()
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [] })
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
  it('Marketing y mercadeo aparece con marketing:read global asignado, sin ningún paquete', () => {
    const read: AccessGrant = { sourceId: 's1', actionId: 'marketing:read', scope: 'global' }
    const shown = render([read])
    expect(shown).toContain('Marketing y mercadeo')
    expect(shown).toContain('href="/marketing"')
    expect(render([{ sourceId: 's1', actionId: 'marketing:edit', scope: 'global' }])).not.toContain('Marketing y mercadeo')
    expect(render([])).not.toContain('Marketing y mercadeo')
  })
  it('Marketing y mercadeo también aparece con solo una acción de avisos', () => {
    for (const actionId of ['commercialPromotions:read', 'commercialPromotions:create']) {
      const html = render([{ sourceId: 's1', actionId, scope: 'team' }])
      expect(html).toContain('Marketing y mercadeo')
      expect(html).toContain('href="/marketing"')
    }
    expect(render([{ sourceId: 's1', actionId: 'commercialPromotions:edit', scope: 'team' }])).not.toContain('Marketing y mercadeo')
  })
  it('Comercial ya no se abre por avisos: quien solo tiene avisos no ve el panel Comercial', () => {
    expect(render([{ sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' }])).not.toContain('Panel Comercial')
  })
  it('una acción de marketing que no sea global, o que no sea ver, no muestra el ítem', () => {
    expect(render([{ sourceId: 's1', actionId: 'marketing:read', scope: 'own' }])).not.toContain('Marketing y mercadeo')
    expect(render([{ sourceId: 's1', actionId: 'marketing:publish', scope: 'global' }])).not.toContain('Marketing y mercadeo')
  })
  it('la acción de marketing decide por sí sola: no importa la fuente ni el cargo', () => {
    const read: AccessGrant = { sourceId: 'cualquier-fuente', actionId: 'marketing:read', scope: 'global' }
    expect(render([read])).toContain('Marketing y mercadeo')
  })
  it('el mismo cargo puede recibir solo Catálogo o solo Comercial', () => {
    const catalog = render([{ sourceId: 's1', actionId: 'products:write', scope: 'global' }])
    expect(catalog).toContain('>Biblioteca<')
    expect(catalog).toContain('href="/commercial/library/update/products"')
    expect(render([{ sourceId: 's1', actionId: 'listas:read', scope: 'list', resourceId: 'l1' }])).not.toContain('>Biblioteca<')
    expect(catalog).not.toContain('Panel Comercial')
    const commercial = render([{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }])
    expect(commercial).toContain('Panel Comercial')
    expect(commercial).not.toContain('>Biblioteca<')
  })
  it('Productos y búsqueda aparecen con la acción de ver productos', () => {
    const html = render([{ sourceId: 's1', actionId: 'products:read', scope: 'global' }])
    expect(html).toContain('>Biblioteca<')
    expect(html).toContain('href="/commercial/products"')
    expect(html).toContain('Buscar productos, categorías, marcas...')
    // Editar fichas necesita ver productos: quien tiene ambas acciones entra por Productos y tiene la búsqueda.
    const update = render([
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' },
    ])
    expect(update).toContain('href="/commercial/products"')
    expect(update).toContain('Buscar productos, categorías, marcas...')
    // Sin ver productos, Fichas no trae la búsqueda.
    const writeOnly = render([{ sourceId: 's1', actionId: 'products:write', scope: 'global' }])
    expect(writeOnly).toContain('href="/commercial/library/update/products"')
    expect(writeOnly).not.toContain('href="/commercial/products"')
    expect(writeOnly).not.toContain('Buscar productos, categorías, marcas...')
    const prices = render([{ sourceId: 's1', actionId: 'prices:preview', scope: 'global' }])
    expect(prices).toContain('>Biblioteca<')
    expect(prices).toContain('href="/commercial/library/update"')
    expect(prices).not.toContain('href="/commercial/products"')
    expect(prices).not.toContain('Buscar productos, categorías, marcas...')
    const publication = render([{ sourceId: 's1', actionId: 'products:publish', scope: 'global' }])
    // Publicar en tienda es un complemento: sin Fichas no abre ninguna pestaña.
    expect(publication).not.toContain('href="/catalog-management/publication"')
    expect(publication).not.toContain('href="/commercial/products"')
    expect(publication).not.toContain('>Biblioteca<')
  })
  it('esperar la consulta no muestra accesos heredados del cargo', () => {
    const html = render()
    expect(html).not.toContain('Panel Comercial')
    expect(html).not.toContain('>Biblioteca<')
  })
})
