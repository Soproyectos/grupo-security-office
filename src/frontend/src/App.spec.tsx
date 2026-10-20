import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { useAuthStore } from './stores/auth.store'
import { userAccessKey } from './features/users/access'
import type { AccessGrant } from './services/users.service'

vi.mock('./pages/ProductsPage', () => ({ default: () => <p>DATOS-BIBLIOTECA</p> }))
vi.mock('./pages/AssignedHome', () => ({ default: () => <p>DATOS-RESUMEN</p> }))
vi.mock('./pages/AssignedReportsPage', () => ({ default: () => <p>DATOS-EQUIPO</p> }))
vi.mock('./features/agenda/AgendaCalendarPage', () => ({ default: () => <p>DATOS-AGENDA</p> }))
vi.mock('./pages/CustomersPage', () => ({ default: () => <p>DATOS-CLIENTES</p> }))

function login(roles = ['Consulta']) {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}
function renderAt(path: string, grants?: AccessGrant[], failed = false) {
  const client = new QueryClient()
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [], packages: [] })
  if (failed) client.getQueryCache().build(client, { queryKey: userAccessKey('u1') }).setState({ status: 'error', error: new Error('sin conexión') })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => login())
describe('rutas administrativas con asignaciones expresas', () => {
  it('usuario sin asignaciones queda sin datos al entrar por inicio o URL directa', () => {
    for (const path of ['/', '/commercial/products', '/commercial/customers', '/sales', '/supervisor', '/agenda']) {
      const html = renderAt(path, [])
      expect(html).toContain('Sin paneles asignados')
      expect(html).not.toMatch(/DATOS-(BIBLIOTECA|CLIENTES|RESUMEN|EQUIPO|AGENDA)/)
    }
  })
  it('cargar o fallar no monta la Biblioteca aunque haya datos antiguos de acceso', () => {
    expect(renderAt('/commercial/products')).not.toContain('DATOS-BIBLIOTECA')
    const html = renderAt('/commercial/products', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], true)
    expect(html).not.toContain('DATOS-BIBLIOTECA')
  })
  it('un usuario de cualquier cargo entra al panel que recibió', () => {
    login(['Vendedor'])
    const html = renderAt('/commercial/products', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }])
    expect(html).toContain('DATOS-BIBLIOTECA')
    expect(html).toContain('Catálogo y precios')
  })
  it('recibir un panel no permite abrir otra herramienta por URL', () => {
    const html = renderAt('/commercial/customers', [{ sourceId: 's1', actionId: 'quotes:read', scope: 'own' }])
    expect(html).not.toContain('DATOS-CLIENTES')
    expect(html).toContain('No tienes acceso a este apartado.')
  })
  it('retirar la última concesión conserva la identidad y retira la página', () => {
    expect(renderAt('/commercial/products', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }])).toContain('DATOS-BIBLIOTECA')
    expect(renderAt('/commercial/products', [])).not.toContain('DATOS-BIBLIOTECA')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
  it('Supervisor abre datos reales del equipo y no el prototipo ficticio', () => {
    login(['Supervisor'])
    const html = renderAt('/supervisor', [{ sourceId: 's1', actionId: 'teamInsights:read', scope: 'team' }])
    expect(html).toContain('DATOS-EQUIPO')
    expect(html).not.toContain('Vendedor de prueba A')
  })
  it('Agenda es una herramienta compartida fuera de los paneles', () => {
    expect(renderAt('/agenda', [{ sourceId: 's1', actionId: 'activities:read', scope: 'own' }])).toContain('DATOS-AGENDA')
  })
  it('la excepción explícita permite que Super Admin asigne paneles', () => {
    login(['Super Admin'])
    expect(renderAt('/users/access', [])).toContain('Asignación de paquetes de acceso')
  })
  it('no aplica estas restricciones administrativas a la tienda pública', () => {
    expect(renderAt('/tienda', [])).not.toContain('Sin paneles asignados')
  })
})
