import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminLayout from './AdminLayout'
import { userAccessKey } from '../../features/users/access'
import { useAuthStore } from '../../stores/auth.store'

/**
 * AdminLayout es el shell de todo el área admin (App.tsx: `/commercial/*`
 * cuelga de él). Su papel en COM-01 §4: montar UNA vez el acceso real de la
 * identidad con la MISMA queryKey que usa CommercialLayout y el panel de
 * concesiones (`features/users/access.ts`), de modo que el refetch tras
 * revocar actualiza el menú en la misma sesión. El resto de la navegación
 * (Dashboard, Usuarios, Auditoría, tienda, /sales, /supervisor) es de OTROS
 * paneles y no cambia (ficha regla 3): este spec lo asierta.
 */

const captured = vi.hoisted(() => ({
  queries: [] as Array<{ key?: readonly unknown[]; enabled?: boolean }>,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...real,
    useQuery: (options: { queryKey?: readonly unknown[]; enabled?: boolean }) => {
      captured.queries.push({ key: options.queryKey, enabled: options.enabled })
      return (real.useQuery as unknown as (o: unknown) => unknown)(options)
    },
  }
})

const ADMIN_ID = 'admin-1'

function login(roles: string[], id = ADMIN_ID) {
  const session = {
    isAuthenticated: true,
    user: { id, name: 'Usuario de prueba', email: 'user@example.invalid', roles, permissions: [] },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <AdminLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  captured.queries.length = 0
  vi.clearAllMocks()
  login(['Super Admin'])
})

describe('AdminLayout — acceso real montado una sola vez en el shell (COM-01 §4)', () => {
  it('monta el acceso propio con la clave compartida del menú y del panel', () => {
    render()

    const ownAccess = captured.queries.find((entry) => entry.key?.[0] === 'user-access')
    expect(ownAccess?.key).toEqual(userAccessKey(ADMIN_ID))
    expect(ownAccess?.enabled).toBe(true)
  })

  it('el shell consulta el acceso propio de Admin Comercial para resolver sus paneles', () => {
    login(['Admin Comercial'])
    render()

    const ownAccess = captured.queries.find((entry) => entry.key?.[0] === 'user-access')
    expect(ownAccess?.enabled).toBe(true)
  })
})

describe('AdminLayout — preserva la navegación de los otros paneles (regla 3)', () => {
  it('conserva Dashboard, Usuarios y Auditoría del shell admin', () => {
    const html = render()

    expect(html).toContain('href="/"')
    expect(html).toContain('Mi resumen')
    expect(html).toContain('href="/users"')
    expect(html).toContain('Usuarios')
    expect(html).toContain('href="/audit"')
    expect(html).toContain('Auditoría')
  })

  it('las secciones sólo-rol siguen donde estaban (Peticiones y Clientes y escalafones)', () => {
    const html = render()

    expect(html).toContain('href="/team-requests"')
    expect(html).toContain('Peticiones')
    expect(html).toContain('href="/customer-accounts"')
  })

  it('Admin Comercial sin grants conserva herramientas personales sin recibir paneles por el cargo', () => {
    login(['Admin Comercial'])
    const html = render()

    expect(html).toContain('Mi resumen')
    expect(html).toContain('Agenda y tareas')
    expect(html).not.toContain('Panel Comercial')
    expect(html).not.toContain('href="/users"')
  })
})
