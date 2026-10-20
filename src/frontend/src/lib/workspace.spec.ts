import { describe, expect, it } from 'vitest'
import { workspaceRedirect } from './workspace'

describe('workspace route boundary', () => {
  it('redirects a seller away from the administrative workspace', () => {
    expect(workspaceRedirect(['Vendedor'], true, 'admin')).toBe('/sales')
  })
  it('opens the seller workspace without administrative permissions', () => {
    expect(workspaceRedirect(['Vendedor'], true, 'sales')).toBeNull()
  })
  it('requires a session even for a known role', () => {
    expect(workspaceRedirect(['Vendedor'], false, 'sales')).toBe('/login')
    expect(workspaceRedirect(undefined, true, 'sales')).toBe('/login')
  })
  it.each(['Super Admin', 'Admin Comercial', 'Consulta', 'Operador'])(
    'keeps the current workspace for %s', role => {
      expect(workspaceRedirect([role], true, 'admin')).toBeNull()
      expect(workspaceRedirect([role], true, 'sales')).toBe('/')
    },
  )
  it('preserves an explicitly assigned management role', () => {
    expect(workspaceRedirect(['Vendedor', 'Supervisor'], true, 'admin')).toBe('/supervisor')
  })
})

describe('supervisor workspace boundary', () => {
  it('blocks administrative routes and opens the team workspace', () => {
    expect(workspaceRedirect(['Supervisor'], true, 'admin')).toBe('/supervisor')
    expect(workspaceRedirect(['Supervisor'], true, 'sales')).toBe('/supervisor')
    expect(workspaceRedirect(['Supervisor'], true, 'supervisor')).toBeNull()
  })
  it('preserves independently granted broader roles', () => {
    expect(workspaceRedirect(['Supervisor', 'Super Admin'], true, 'admin')).toBeNull()
    expect(workspaceRedirect(['Supervisor', 'Admin Comercial'], true, 'admin')).toBeNull()
  })
  it('keeps sellers outside the supervisor workspace', () => {
    expect(workspaceRedirect(['Vendedor'], true, 'supervisor')).toBe('/sales')
  })
})
