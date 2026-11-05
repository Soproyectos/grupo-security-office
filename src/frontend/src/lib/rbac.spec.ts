import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth.store'
import { hasAnyPermission, hasPermission } from './rbac'

function login(roles: string[], permissions: string[]) {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions },
  })
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null })
})

describe('permisos de Biblioteca', () => {
  it('Super Admin obtiene permisos de Biblioteca sin permisos explícitos', () => {
    login(['Super Admin'], [])
    for (const permission of ['products:read', 'products:write', 'prices:read', 'prices:apply', 'providers:read']) {
      expect(hasPermission(permission)).toBe(true)
    }
    expect(hasAnyPermission(['customers:read', 'products:publish'])).toBe(true)
    expect(hasPermission('customers:read')).toBe(false)
  })

  it('otros usuarios dependen de los permisos explícitos de su perfil', () => {
    login(['Operador'], [])
    expect(hasPermission('products:read')).toBe(false)
    expect(hasAnyPermission(['products:write', 'prices:read'])).toBe(false)

    login(['Operador'], ['products:write'])
    expect(hasPermission('products:write')).toBe(true)
    expect(hasPermission('prices:read')).toBe(false)
    expect(hasAnyPermission(['prices:read', 'products:write'])).toBe(true)
  })

  it('el bypass de Super Admin no cambia permisos de otros dominios', () => {
    login(['Super Admin'], [])
    expect(hasPermission('users:read')).toBe(false)
    expect(hasAnyPermission(['users:read', 'audit:read'])).toBe(false)
  })
})
