import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth.store'
import { ProductAuditTab } from './ProductAuditTab'

function renderHistory(permissions: string[]) {
  const session = { user: { id: 'u-1', name: 'Prueba', email: 'qa@example.invalid', roles: ['Consulta'], permissions }, isAuthenticated: true }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
  const client = new QueryClient()
  client.setQueryData(['product-audit', 'p-1', 'operations'], [])
  client.setQueryData(['product-audit', 'p-1', 'fields'], {
    pages: [{ items: [{ id: 'c-1', field: 'name', oldValue: 'Antes', newValue: 'Después', actorId: 'u-1', actorName: 'Equipo de pruebas', createdAt: '2026-10-26T12:00:00Z' }], nextCursor: null }],
    pageParams: [undefined],
  })
  return renderToStaticMarkup(<QueryClientProvider client={client}><ProductAuditTab productId="p-1" /></QueryClientProvider>)
}

describe('historial de Actualización', () => {
  it('muestra el cambio de campo aunque no exista una entrada de auditoría antigua', () => {
    const html = renderHistory(['products:read', 'products:write', 'products:notes'])
    expect(html).toContain('Equipo de pruebas')
    expect(html).toContain('Nombre')
    expect(html).toContain('Antes')
    expect(html).toContain('Después')
  })
  it.each([['products:read'], ['products:read', 'products:publish'], ['products:read', 'products:write']])('no revela cambios internos sin Actualización y notas: %j', (...permissions) => {
    const html = renderHistory(permissions)
    expect(html).not.toContain('Después')
    expect(html).not.toContain('Equipo de pruebas')
    expect(html).toContain('No tienes permisos')
  })
})
