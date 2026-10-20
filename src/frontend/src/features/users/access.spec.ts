import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { fetchUserAccess, type UserAccessState } from '../../services/users.service'
import {
  applyPackageInCache,
  commercialAccess,
  COMMERCIAL_TABS,
  CATALOG_TABS,
  panelAccess,
  hasAssignedAction,
  NO_PANELS_MESSAGE,
  refreshSessionAfterAccessChange,
  revokePackageInCache,
  userAccessKey,
} from './access'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const ADMIN = {
  id: 'admin-1',
  email: 'admin@example.invalid',
  name: 'Super Admin de prueba',
  roles: ['Super Admin'],
  permissions: [],
}

function accessState(partial: Partial<UserAccessState> = {}): UserAccessState {
  return {
    catalogVersion: 'panels-20261019-3',
    accessVersion: 4,
    grants: [
      { sourceId: 'src-1', actionId: 'products:read', scope: 'global' },
      { sourceId: 'src-1', actionId: 'listas:read', scope: 'global' },
      { sourceId: 'src-2', actionId: 'customers:read', scope: 'team' },
    ],
    sources: [],
    packages: [],
    ...partial,
  }
}

describe('navegación por asignaciones individuales', () => {
  it('separa Comercial de Catálogo y precios para el mismo usuario', () => {
    const input = { roles: ['Admin Comercial'], grants: accessState().grants, status: 'ready' as const }
    expect(commercialAccess(input).tabs.map(tab => tab.to)).toEqual(['/commercial/customers'])
    expect(panelAccess(input, 'catalog').tabs.map(tab => tab.to)).toEqual(['/commercial/lists', '/commercial/products'])
  })

  it('el cargo no concede paneles cuando no hay asignaciones', () => {
    for (const roles of [['Admin Comercial'], ['Supervisor'], ['Vendedor'], []]) {
      const input = { roles, grants: [], status: 'ready' as const }
      expect(commercialAccess(input).hasAnyPanel).toBe(false)
      expect(panelAccess(input, 'catalog').tabs).toEqual([])
    }
    expect(NO_PANELS_MESSAGE).toBe('Sin paneles asignados')
  })

  it('no recupera permisos del cargo mientras carga ni si falla la consulta', () => {
    for (const status of ['loading', 'unavailable'] as const) {
      const input = { roles: ['Admin Comercial'], grants: accessState().grants, status }
      expect(commercialAccess(input).tabs).toEqual([])
      expect(panelAccess(input, 'catalog').tabs).toEqual([])
      expect(hasAssignedAction(input, ['products:read'])).toBe(false)
    }
  })

  it('retirar la última asignación bloquea el siguiente render sin cambiar identidad', () => {
    const input = { roles: ['Supervisor'], grants: accessState().grants, status: 'ready' as const }
    expect(hasAssignedAction(input, ['customers:read'])).toBe(true)
    expect(hasAssignedAction({ ...input, grants: [] }, ['customers:read'])).toBe(false)
  })

  it('concede navegación por acción y conserva el alcance para el servidor', () => {
    const access = commercialAccess({ roles: ['Consulta'], grants: [{ sourceId: 's1', actionId: 'quotes:read', scope: 'own' }], status: 'ready' })
    expect(access.tabs.map(tab => tab.label)).toEqual(['Cotizaciones'])
  })

  it('Super Admin conserva la excepción explícita para ambos paneles', () => {
    const input = { roles: ['Super Admin'], grants: [], status: 'ready' as const }
    expect(commercialAccess(input).tabs).toEqual(COMMERCIAL_TABS)
    expect(panelAccess(input, 'catalog').tabs).toEqual(CATALOG_TABS)
  })

  it('Mi resumen, Agenda y configuración de web no se duplican como pestañas comerciales', () => {
    const labels = [...COMMERCIAL_TABS, ...CATALOG_TABS].map(tab => tab.label)
    expect(labels).not.toContain('Mi resumen')
    expect(labels).not.toContain('Agenda y tareas')
    expect(labels).not.toContain('Configuración')
  })
})

describe('refreshSessionAfterAccessChange — revocación sin cerrar sesión (aceptación 3)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.getState().login(ADMIN)
  })

  /** Siembra la caché como la deja el menú montado: prefetch con su queryFn. */
  async function seedMountedAccess(client: QueryClient, userId: string, state: UserAccessState) {
    vi.mocked(api.get).mockResolvedValueOnce({ data: state })
    await client.prefetchQuery({
      queryKey: userAccessKey(userId),
      queryFn: () => fetchUserAccess(userId),
    })
  }

  it('tras quitar un paquete refetchea el acceso y la identidad en la MISMA sesión', async () => {
    const client = new QueryClient()
    const userId = 'user-1'
    await seedMountedAccess(
      client,
      userId,
      accessState({
        grants: [{ sourceId: 'src-1', actionId: 'products:read', scope: 'global' }],
        packages: [
          { id: 'vendedor', name: 'Vendedor', selections: [], applied: true, sourceId: 'src-1' },
        ],
        accessVersion: 4,
      }),
    )

    vi.mocked(api.delete).mockResolvedValue({
      data: { userId, sourceId: 'src-1', accessVersion: 5, changed: true, grants: [] },
    })
    const revoked = accessState({
      grants: [],
      packages: [{ id: 'vendedor', name: 'Vendedor', selections: [], applied: false, sourceId: null }],
      accessVersion: 5,
    })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: revoked }
      if (path === '/auth/profile') return { data: { ...ADMIN, roles: ['Vendedor'] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await revokePackageInCache(client, userId, 'vendedor', 4)

    expect(api.delete).toHaveBeenCalledWith(`/users/${userId}/access/packages/vendedor`, {
      params: { expectedVersion: 4 },
    })
    const after = client.getQueryData<UserAccessState>(userAccessKey(userId))
    expect(after?.accessVersion).toBe(5)
    expect(after?.packages[0]?.applied).toBe(false)
    // La identidad se refetchea y se re-escribe sin cerrar sesión.
    expect(api.get).toHaveBeenCalledWith('/auth/profile')
    expect(useAuthStore.getState().user?.roles).toEqual(['Vendedor'])
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(client.getQueryState(userAccessKey(userId))?.isInvalidated).toBe(false)
  })

  it('aplicar un paquete también refetchea la caché compartida del menú', async () => {
    const client = new QueryClient()
    const userId = 'user-1'
    await seedMountedAccess(client, userId, accessState({ grants: [], accessVersion: 0 }))

    vi.mocked(api.put).mockResolvedValue({
      data: { userId, sourceId: 'src-1', accessVersion: 1, changed: true, grants: [] },
    })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: accessState({ accessVersion: 1 }) }
      if (path === '/auth/profile') return { data: ADMIN }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await applyPackageInCache(client, userId, 'vendedor', 0)

    expect(api.put).toHaveBeenCalledWith(`/users/${userId}/access`, {
      packageId: 'vendedor',
      grants: [],
      expectedVersion: 0,
      expectedCatalogVersion: 'panels-20261019-3',
    })
    expect(client.getQueryData<UserAccessState>(userAccessKey(userId))?.accessVersion).toBe(1)
  })

  it('si el refetch de identidad falla, la sesión sigue viva y el acceso ya quedó refetcheado', async () => {
    const client = new QueryClient()
    const userId = 'user-1'
    await seedMountedAccess(client, userId, accessState({ accessVersion: 4 }))

    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: accessState({ accessVersion: 5 }) }
      throw new Error('profile caído')
    })

    await expect(
      refreshSessionAfterAccessChange(client, userId),
    ).resolves.toBeUndefined()

    expect(client.getQueryData<UserAccessState>(userAccessKey(userId))?.accessVersion).toBe(5)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
