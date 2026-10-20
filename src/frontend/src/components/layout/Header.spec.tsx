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
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [], packages: [] })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><Header /></MemoryRouter></QueryClientProvider>)
}
describe('menú principal por trabajo asignado', () => {
  it('sin asignaciones conserva herramientas personales sin enlaces administrativos', () => {
    const html = render([])
    expect(html).toContain('Mi resumen')
    expect(html).toContain('Agenda y tareas')
    expect(html).not.toContain('Panel Comercial')
    expect(html).not.toContain('Catálogo y precios')
    expect(html).not.toContain('href="/users"')
  })
  it('el mismo cargo puede recibir solo Catálogo o solo Comercial', () => {
    const catalog = render([{ sourceId: 's1', actionId: 'listas:read', scope: 'list', resourceId: 'l1' }])
    expect(catalog).toContain('Catálogo y precios')
    expect(catalog).not.toContain('Panel Comercial')
    const commercial = render([{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }])
    expect(commercial).toContain('Panel Comercial')
    expect(commercial).not.toContain('Catálogo y precios')
  })
  it('esperar la consulta no muestra accesos heredados del cargo', () => {
    const html = render()
    expect(html).not.toContain('Panel Comercial')
    expect(html).not.toContain('Catálogo y precios')
  })
})
