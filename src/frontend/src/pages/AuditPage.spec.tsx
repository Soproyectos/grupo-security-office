import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AuditPage from './AuditPage'
import { userAccessKey } from '../features/users/access'
import { useAuthStore } from '../stores/auth.store'

/** Auditoría se ofrece con la acción asignada audit:read (Super Admin siempre), nunca por cargo. */
function login(roles: string[]) {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

function render(grants?: { actionId: string; scope: string }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (grants) client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, sources: [], grants: grants.map((grant) => ({ sourceId: 's1', ...grant })) })
  return renderToStaticMarkup(<QueryClientProvider client={client}><AuditPage /></QueryClientProvider>)
}

describe('AuditPage — acción audit:read', () => {
  beforeEach(() => login(['Admin Comercial']))

  it('el cargo Admin Comercial sin la acción no ve la auditoría', () => {
    const html = render([{ actionId: 'quotes:read', scope: 'global' }])
    expect(html).toContain('No tienes permisos para ver esta sección')
    expect(html).not.toContain('Auditoría global')
  })

  it('con audit:read (sin cargo especial) ve la auditoría', () => {
    login(['Operador'])
    const html = render([{ actionId: 'audit:read', scope: 'global' }])
    expect(html).toContain('Auditoría global')
  })

  it('Super Admin la ve sin concesiones', () => {
    login(['Super Admin'])
    expect(render([])).toContain('Auditoría global')
  })
})
