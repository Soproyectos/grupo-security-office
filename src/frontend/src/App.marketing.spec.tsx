import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { useAuthStore } from './stores/auth.store'
import { userAccessKey } from './features/users/access'
import type { AccessGrant } from './services/users.service'

// Server rendering never runs the effect of <Navigate>, so it is replaced by a marker that names the target.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, Navigate: ({ to }: { to: string }) => <p data-redirect={to} /> }
})
vi.mock('./features/marketing/BannersTab', () => ({ default: () => <p>DATOS-BANNERS</p> }))
vi.mock('./features/promotions/PromotionManagerPage', () => ({ default: () => <p>DATOS-GESTIONAR-AVISOS</p> }))
vi.mock('./features/promotions/SalesPromotionsPanel', () => ({ default: () => <p>DATOS-PROMOCIONES-INTERNAS</p> }))
vi.mock('./pages/AssignedHome', () => ({ default: () => <p>DATOS-RESUMEN</p> }))

function login(roles = ['Consulta']) {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}
function renderAt(path: string, grants: AccessGrant[]) {
  const client = new QueryClient()
  client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [] })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}
const promo = (...actions: string[]): AccessGrant[] => actions.map((action) => ({ sourceId: 's1', actionId: `commercialPromotions:${action}`, scope: 'team' }))
const redirectsTo = (html: string) => /data-redirect="([^"]+)"/.exec(html)?.[1]

beforeEach(() => login())

describe('panel Marketing con Banners, Promociones internas y Gestionar avisos', () => {
  it('las direcciones antiguas redirigen a las nuevas sin montar la página', () => {
    const all = promo('read', 'create')
    const notices = renderAt('/promotions', all)
    expect(redirectsTo(notices)).toBe('/marketing/notices')
    expect(notices).not.toContain('DATOS-GESTIONAR-AVISOS')
    const promotions = renderAt('/sales/promotions', all)
    expect(redirectsTo(promotions)).toBe('/marketing/promotions')
    expect(promotions).not.toContain('DATOS-PROMOCIONES-INTERNAS')
  })
  it('/marketing abre la primera pestaña que la persona tiene', () => {
    expect(redirectsTo(renderAt('/marketing', promo('read')))).toBe('/marketing/promotions')
    expect(redirectsTo(renderAt('/marketing', promo('create')))).toBe('/marketing/notices')
    expect(redirectsTo(renderAt('/marketing', [{ sourceId: 's1', actionId: 'marketing:read', scope: 'global' }]))).toBe('/marketing/banners')
    login(['Super Admin'])
    expect(redirectsTo(renderAt('/marketing', []))).toBe('/marketing/banners')
  })
  it('Promociones internas monta con commercialPromotions:read y no con las demás acciones de avisos', () => {
    const allowed = renderAt('/marketing/promotions', promo('read'))
    expect(allowed).toContain('DATOS-PROMOCIONES-INTERNAS')
    expect(allowed).toContain('aria-label="Navegación de Marketing"')
    const denied = renderAt('/marketing/promotions', promo('create', 'edit'))
    expect(denied).not.toContain('DATOS-PROMOCIONES-INTERNAS')
    expect(denied).toContain('No tienes acceso a este apartado.')
  })
  it('Gestionar avisos monta con las acciones de gestión que ya exigía y no con solo ver', () => {
    expect(renderAt('/marketing/notices', promo('create'))).toContain('DATOS-GESTIONAR-AVISOS')
    expect(renderAt('/marketing/notices', promo('create', 'publish'))).toContain('DATOS-GESTIONAR-AVISOS')
    const denied = renderAt('/marketing/notices', promo('read'))
    expect(denied).not.toContain('DATOS-GESTIONAR-AVISOS')
    expect(denied).toContain('No tienes acceso a este apartado.')
  })
  it('quien solo tiene promociones no abre Banners por la dirección', () => {
    const html = renderAt('/marketing/banners', promo('read', 'create'))
    expect(html).not.toContain('DATOS-BANNERS')
    expect(html).not.toContain('href="/marketing/banners"')
    expect(html).toContain('href="/marketing/promotions"')
    expect(html).toContain('href="/marketing/notices"')
  })
  it('quien solo tiene banners abre Banners y no ve las pestañas de avisos', () => {
    const html = renderAt('/marketing/banners', [{ sourceId: 's1', actionId: 'marketing:read', scope: 'global' }])
    expect(html).toContain('DATOS-BANNERS')
    expect(html).toContain('href="/marketing/banners"')
    expect(html).not.toContain('href="/marketing/promotions"')
    expect(html).not.toContain('href="/marketing/notices"')
  })
  it('Banners se abre solo con las acciones de marketing asignadas, sin importar de dónde vengan', () => {
    const own = renderAt('/marketing/banners', [{ sourceId: 's1', actionId: 'marketing:read', scope: 'own' }])
    expect(own).not.toContain('DATOS-BANNERS')
    const publishOnly = renderAt('/marketing/banners', [{ sourceId: 's1', actionId: 'marketing:publish', scope: 'global' }])
    expect(publishOnly).not.toContain('DATOS-BANNERS')
    const other = renderAt('/marketing/banners', [{ sourceId: 'otra-fuente', actionId: 'marketing:read', scope: 'global' }])
    expect(other).toContain('DATOS-BANNERS')
  })
  it('sin ninguna acción del panel no se monta ninguna página', () => {
    const html = renderAt('/marketing/notices', [])
    expect(html).toContain('Sin acceso a este panel')
    expect(html).not.toContain('DATOS-GESTIONAR-AVISOS')
    expect(html).not.toContain('biblioteca-workspace__nav')
  })
  it('Super Admin ve las tres pestañas y entra a cada página', () => {
    login(['Super Admin'])
    for (const [path, marker] of [
      ['/marketing/banners', 'DATOS-BANNERS'],
      ['/marketing/promotions', 'DATOS-PROMOCIONES-INTERNAS'],
      ['/marketing/notices', 'DATOS-GESTIONAR-AVISOS'],
    ] as const) {
      const html = renderAt(path, [])
      expect(html).toContain(marker)
      for (const href of ['/marketing/banners', '/marketing/promotions', '/marketing/notices']) expect(html).toContain(`href="${href}"`)
    }
  })
})
