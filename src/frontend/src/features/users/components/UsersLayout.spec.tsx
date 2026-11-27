import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../../../App'
import { useAuthStore } from '../../../stores/auth.store'
import { userAccessKey } from '../access'
import type { AccessGrant } from '../../../services/users.service'
import { UsersWorkspace, USERS_TABS, visibleUsersTabs } from './UsersLayout'

vi.mock('../../../pages/UsersPage', () => ({ default: () => <p>DATOS-USUARIOS</p> }))
vi.mock('./UserAccessAssignments', () => ({ default: () => <p>DATOS-ASIGNAR-PANELES</p> }))

const USERS_READ: AccessGrant = { sourceId: 's1', actionId: 'users:read', scope: 'global' }

function login(roles: string[]) {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

function renderAt(path: string, grants: AccessGrant[] = []) {
  const client = new QueryClient()
  client.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants, sources: [] })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}

function renderBar(path: string, tabs = USERS_TABS) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><UsersWorkspace tabs={tabs}><p>CONTENIDO</p></UsersWorkspace></MemoryRouter>)
}

beforeEach(() => login(['Consulta']))

describe('pestañas visibles del panel Usuarios', () => {
  it('Super Admin ve las dos pestañas', () => {
    expect(visibleUsersTabs({ roles: ['Super Admin'], grants: [], status: 'ready' }).map((tab) => tab.id)).toEqual(['users', 'access'])
  })

  it('quien solo tiene users:read ve Usuarios y no Asignar paneles', () => {
    expect(visibleUsersTabs({ roles: ['Administrador'], grants: [USERS_READ], status: 'ready' }).map((tab) => tab.id)).toEqual(['users'])
  })

  it('sin la acción asignada, o mientras se comprueba el acceso, no hay pestañas', () => {
    expect(visibleUsersTabs({ roles: ['Consulta'], grants: [], status: 'ready' })).toEqual([])
    expect(visibleUsersTabs({ roles: ['Consulta'], grants: [USERS_READ], status: 'loading' })).toEqual([])
  })
})

describe('barra del panel Usuarios', () => {
  it('marca la pestaña activa por ruta y muestra su ayuda', () => {
    const users = renderBar('/users')
    expect(users).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/users"[^>]*>.*Usuarios/)
    expect(users).toContain('Crea y edita las cuentas de las personas del equipo.')
    expect(users).not.toContain('Da o quita a cada persona el acceso a los paneles.')

    const access = renderBar('/users/access')
    expect(access).toMatch(/aria-current="page"[^>]*href="\/users\/access"/)
    expect(access).toContain('Da o quita a cada persona el acceso a los paneles.')
    // «Usuarios» (end) must not stay active while «Asignar paneles» is open.
    expect(access.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('con una sola pestaña no pinta la barra pero sí la página', () => {
    const html = renderBar('/users', USERS_TABS.slice(0, 1))
    expect(html).toContain('CONTENIDO')
    expect(html).not.toContain('biblioteca-workspace')
  })

  it('no repite títulos: la barra no lleva h1 propio', () => {
    expect(renderBar('/users')).not.toContain('<h1')
  })
})

describe('rutas de Usuarios', () => {
  it('/users sigue abriendo la página de usuarios y /users/access la de asignar paneles', () => {
    login(['Super Admin'])
    const users = renderAt('/users')
    expect(users).toContain('DATOS-USUARIOS')
    expect(users).not.toContain('DATOS-ASIGNAR-PANELES')
    expect(users).toContain('aria-label="Navegación de Usuarios"')

    const access = renderAt('/users/access')
    expect(access).toContain('DATOS-ASIGNAR-PANELES')
    expect(access).not.toContain('DATOS-USUARIOS')
    expect(access).toContain('aria-label="Navegación de Usuarios"')
  })

  it('conserva los guardas: users:read abre Usuarios sin barra, y Asignar paneles sigue solo para Super Admin', () => {
    login(['Administrador'])
    const users = renderAt('/users', [USERS_READ])
    expect(users).toContain('DATOS-USUARIOS')
    expect(users).not.toContain('Navegación de Usuarios')

    const access = renderAt('/users/access', [USERS_READ])
    expect(access).not.toContain('DATOS-ASIGNAR-PANELES')
    expect(access).toContain('No tienes acceso a este apartado.')
  })

  it('sin users:read no se monta la página de usuarios', () => {
    const html = renderAt('/users', [])
    expect(html).not.toContain('DATOS-USUARIOS')
    expect(html).toContain('Sin paneles asignados')
  })
})
