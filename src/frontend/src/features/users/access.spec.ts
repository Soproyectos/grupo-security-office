import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { fetchUserAccess, type UserAccessState } from '../../services/users.service'
import {
  actionLabel,
  applyPackageInCache,
  fetchOwnAccessWithProfile,
  commercialAccess,
  COMMERCIAL_TABS,
  CATALOG_TABS,
  panelAccess,
  firstAssignedLibraryPath,
  hasAssignedAction,
  hasAssignedLibraryPanel,
  isCatalogPath,
  NO_PANELS_MESSAGE,
  refreshSessionAfterAccessChange,
  revokePackageInCache,
  saveLibrarySelectionInCache,
  subscribeOwnAccessEvents,
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
    const grants = [...accessState().grants, { sourceId: 'src-1', actionId: 'products:write', scope: 'global' as const }]
    const input = {
      roles: ['Admin Comercial'], grants, status: 'ready' as const,
      packages: [
        { id: 'biblioteca-consulta', applied: true },
        { id: 'biblioteca-fichas', applied: true },
      ],
    }
    expect(commercialAccess(input).tabs.map(tab => tab.to)).toEqual(['/commercial/customers'])
    expect(panelAccess(input, 'catalog').tabs.map(tab => tab.to)).toEqual(['/commercial/products', '/commercial/library/update/products'])
  })

  it('cada pestaña requiere su paquete exacto aplicado y su acción necesaria', () => {
    const input = (actionId: string, packageId: string, applied = true) => ({
      roles: ['Consulta'],
      grants: [{ sourceId: 's1', actionId, scope: 'global' as const }],
      packages: [{ id: packageId, applied }],
      status: 'ready' as const,
    })
    expect(hasAssignedLibraryPanel(input('products:read', 'biblioteca-fichas'), 'biblioteca-consulta')).toBe(false)
    expect(hasAssignedLibraryPanel(input('products:write', 'biblioteca-fichas'), 'biblioteca-fichas')).toBe(true)
    expect(hasAssignedLibraryPanel(input('prices:preview', 'biblioteca-precios'), 'biblioteca-precios')).toBe(true)
    // Cada pestaña exige su propio paquete: el de la otra no la abre aunque el permiso exista.
    expect(hasAssignedLibraryPanel(input('products:write', 'biblioteca-precios'), 'biblioteca-fichas')).toBe(false)
    expect(hasAssignedLibraryPanel(input('prices:preview', 'biblioteca-fichas'), 'biblioteca-precios')).toBe(false)
    expect(hasAssignedLibraryPanel(input('products:read', 'biblioteca-consulta', false), 'biblioteca-consulta')).toBe(false)
    expect(hasAssignedLibraryPanel(input('products:read', 'biblioteca-consulta'), 'biblioteca-consulta')).toBe(true)
    expect(hasAssignedLibraryPanel(input('products:publish', 'biblioteca-publicacion'), 'biblioteca-publicacion')).toBe(true)
    expect(hasAssignedLibraryPanel({ ...input('products:read', 'biblioteca-consulta'), grants: [] }, 'biblioteca-consulta')).toBe(false)
  })

  it('dependencias products:read de Fichas/Publicar en tienda no conceden la pestaña Productos', () => {
    const updateOnly = {
      roles: ['Consulta'], status: 'ready' as const,
      grants: [
        { sourceId: 's1', actionId: 'products:read', scope: 'global' as const },
        { sourceId: 's1', actionId: 'products:write', scope: 'global' as const },
      ],
      packages: [{ id: 'biblioteca-fichas', applied: true }],
    }
    const publicationOnly = {
      roles: ['Consulta'], status: 'ready' as const,
      grants: [
        { sourceId: 's1', actionId: 'products:read', scope: 'global' as const },
        { sourceId: 's1', actionId: 'products:publish', scope: 'global' as const },
      ],
      packages: [{ id: 'biblioteca-publicacion', applied: true }],
    }
    expect(panelAccess(updateOnly, 'catalog').tabs.map(tab => tab.to)).toEqual(['/commercial/library/update/products'])
    expect(panelAccess(publicationOnly, 'catalog').tabs.map(tab => tab.to)).toEqual([])
    expect(panelAccess({ roles: ['Super Admin'], grants: [], packages: [], status: 'unavailable' }, 'catalog').tabs)
      .toEqual(CATALOG_TABS)
  })

  it('listas:read ya no concede ninguna pestaña de Biblioteca', () => {
    const catalogTabs = panelAccess(
      { roles: ['Admin Comercial'], grants: [{ sourceId: 's1', actionId: 'listas:read', scope: 'global' }], packages: [], status: 'ready' },
      'catalog',
    ).tabs.map(tab => tab.to)
    expect(catalogTabs).toEqual([])
  })

  it('Biblioteca expone cinco pestañas independientes (Publicar en tienda es un complemento)', () => {
    expect(CATALOG_TABS.map(({ to, label, actionId }) => ({ to, label, actionId }))).toEqual([
      { to: '/commercial/products', label: 'Productos', actionId: 'products:read' },
      { to: '/commercial/library/update/products', label: 'Fichas', actionId: 'products:write' },
      { to: '/commercial/library/update', label: 'Precios', actionId: 'prices:preview' },
      { to: '/commercial/library/update/import', label: 'Importaciones', actionId: 'imports:read' },
      { to: '/commercial/library/masters', label: 'Catálogos maestros', actionId: 'masters:read' },
    ])
  })

  describe('combinaciones de pestañas de Biblioteca', () => {
    const GRANTS = {
      'biblioteca-consulta': ['products:read', 'prices:read'],
      'biblioteca-fichas': ['products:read', 'products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read'],
      'biblioteca-precios': ['products:read', 'prices:read', 'prices:preview', 'prices:save', 'prices:apply', 'providers:read', 'providers:write'],
      'biblioteca-actualizacion': ['products:read', 'products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read', 'prices:preview', 'prices:save', 'prices:apply', 'providers:read', 'providers:write'],
    } as const
    const inputFor = (packageIds: Array<keyof typeof GRANTS>) => ({
      roles: ['Consulta'], status: 'ready' as const,
      grants: [...new Set(packageIds.flatMap((id) => GRANTS[id]))].map((actionId) => ({ sourceId: 's1', actionId, scope: 'global' as const })),
      packages: packageIds.map((id) => ({ id, applied: true })),
    })
    const labels = (packageIds: Array<keyof typeof GRANTS>) => panelAccess(inputFor(packageIds), 'catalog').tabs.map((tab) => tab.label)

    it.each([
      [['biblioteca-consulta'], ['Productos']],
      [['biblioteca-fichas'], ['Fichas']],
      [['biblioteca-precios'], ['Precios']],
      [['biblioteca-consulta', 'biblioteca-fichas'], ['Productos', 'Fichas']],
      [['biblioteca-consulta', 'biblioteca-precios'], ['Productos', 'Precios']],
      [['biblioteca-fichas', 'biblioteca-precios'], ['Fichas', 'Precios']],
      [['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios'], ['Productos', 'Fichas', 'Precios']],
    ] as Array<[Array<keyof typeof GRANTS>, string[]]>)('paquetes %j muestran solo %j', (packageIds, expected) => {
      expect(labels(packageIds)).toEqual(expected)
    })

    it('el paquete anterior Actualización conserva Fichas y Precios, pero no abre Productos', () => {
      expect(labels(['biblioteca-actualizacion'])).toEqual(['Fichas', 'Precios'])
      expect(labels(['biblioteca-consulta', 'biblioteca-actualizacion'])).toEqual(['Productos', 'Fichas', 'Precios'])
    })

    it('retirar un paquete no deja pestañas por permisos sueltos', () => {
      const withoutPackage = { ...inputFor(['biblioteca-fichas', 'biblioteca-precios']), packages: [{ id: 'biblioteca-fichas', applied: true }] }
      expect(panelAccess(withoutPackage, 'catalog').tabs.map((tab) => tab.label)).toEqual(['Fichas'])
    })

    it('firstAssignedLibraryPath lleva a la primera pestaña asignada o a ninguna', () => {
      expect(firstAssignedLibraryPath(inputFor(['biblioteca-precios']))).toBe('/commercial/library/update')
      expect(firstAssignedLibraryPath(inputFor(['biblioteca-fichas', 'biblioteca-precios']))).toBe('/commercial/library/update/products')
      expect(firstAssignedLibraryPath(inputFor(['biblioteca-consulta', 'biblioteca-precios']))).toBe('/commercial/products')
      expect(firstAssignedLibraryPath({ roles: ['Consulta'], grants: [], packages: [], status: 'ready' })).toBeNull()
    })
  })

  describe('Importaciones y Catálogos maestros', () => {
    const withPackage = (packageId: string, actionIds: string[], applied = true) => ({
      roles: ['Admin Comercial'], status: 'ready' as const,
      grants: actionIds.map((actionId) => ({ sourceId: 's1', actionId, scope: 'global' as const })),
      packages: [{ id: packageId, applied }],
    })
    const labels = (input: ReturnType<typeof withPackage>) => panelAccess(input, 'catalog').tabs.map((tab) => tab.label)

    it('cada pestaña se abre solo con su paquete y su acción global', () => {
      expect(labels(withPackage('biblioteca-importaciones', ['products:read', 'imports:read', 'imports:run']))).toEqual(['Importaciones'])
      expect(labels(withPackage('biblioteca-maestros', ['products:read', 'masters:read', 'masters:write']))).toEqual(['Catálogos maestros'])
    })

    it('pertenecer a Biblioteca o tener Fichas no abre Importaciones ni Catálogos maestros', () => {
      expect(labels(withPackage('biblioteca-fichas', ['products:read', 'products:write']))).toEqual(['Fichas'])
      expect(labels(withPackage('biblioteca-consulta', ['products:read', 'prices:read']))).toEqual(['Productos'])
    })

    it('sin el paquete aplicado o con la acción fuera de alcance global no hay pestaña', () => {
      expect(labels(withPackage('biblioteca-importaciones', ['imports:read'], false))).toEqual([])
      const limited = { ...withPackage('biblioteca-maestros', ['masters:read']), grants: [{ sourceId: 's1', actionId: 'masters:read', scope: 'team' }] }
      expect(labels(limited as never)).toEqual([])
    })

    it('la selección por casillas abre las pestañas nuevas solo con su acción de apertura', () => {
      const sel = { id: 'sel', kind: 'template' as const, templateId: 'biblioteca-seleccion' }
      const base = (actionIds: string[]) => ({
        roles: ['Admin Comercial'], status: 'ready' as const, packages: [], sources: [sel],
        grants: actionIds.map((actionId) => ({ sourceId: 'sel', actionId, scope: 'global' as const })),
      })
      expect(labels(base(['products:read', 'products:approveSpecs']) as never)).toEqual(['Productos'])
      expect(labels(base(['products:read', 'imports:read']) as never)).toEqual(['Productos', 'Importaciones'])
      expect(labels(base(['products:read', 'masters:read', 'masters:write']) as never)).toEqual(['Productos', 'Catálogos maestros'])
      expect(labels(base(['products:read', 'masters:write']) as never)).toEqual(['Productos'])
    })

    it('firstAssignedLibraryPath y hasAssignedAction reconocen las acciones nuevas solo con alcance global', () => {
      expect(firstAssignedLibraryPath(withPackage('biblioteca-importaciones', ['imports:read']))).toBe('/commercial/library/update/import')
      expect(firstAssignedLibraryPath(withPackage('biblioteca-maestros', ['masters:read']))).toBe('/commercial/library/masters')
      expect(hasAssignedAction(withPackage('biblioteca-maestros', ['masters:write']), ['masters:write'])).toBe(true)
      expect(hasAssignedAction({ ...withPackage('biblioteca-maestros', []), grants: [{ sourceId: 's1', actionId: 'imports:run', scope: 'own' }] }, ['imports:run'])).toBe(false)
    })

    it('isCatalogPath cubre las rutas nuevas', () => {
      expect(isCatalogPath('/commercial/library/update/import')).toBe(true)
      expect(isCatalogPath('/commercial/library/masters/marcas')).toBe(true)
    })
  })

  it('isCatalogPath cubre Biblioteca y conserva las rutas de Listas y /catalog-management', () => {
    for (const path of ['/commercial/products', '/commercial/library/update', '/commercial/lists', '/commercial/lists/l1', '/catalog-management/publication']) {
      expect(isCatalogPath(path)).toBe(true)
    }
    for (const path of ['/commercial/customers', '/commercial/quotes']) {
      expect(isCatalogPath(path)).toBe(false)
    }
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

  it('requiere alcance global para abrir Productos, Fichas, Precios y proveedores', () => {
    for (const actionId of ['products:read', 'products:write', 'products:publish', 'prices:read', 'prices:preview', 'providers:read']) {
      expect(hasAssignedAction({ roles: ['Consulta'], grants: [{ sourceId: 's1', actionId, scope: 'own' }], status: 'ready' }, [actionId])).toBe(false)
      expect(hasAssignedAction({ roles: ['Consulta'], grants: [{ sourceId: 's1', actionId, scope: 'global' }], status: 'ready' }, [actionId])).toBe(true)
    }
    expect(hasAssignedAction({ roles: ['Consulta'], grants: [{ sourceId: 's1', actionId: 'quotes:read', scope: 'own' }], status: 'ready' }, ['quotes:read'])).toBe(true)
    expect(hasAssignedAction({ roles: ['Super Admin'], grants: [], status: 'ready' }, ['products:read'])).toBe(true)
  })

  it('sincroniza permissions del perfil propio con las concesiones vigentes', async () => {
    const userId = 'active-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:read'] })
    const expectedAccess = accessState({ grants: [{ sourceId: 'manual-1', actionId: 'products:write', scope: 'global' }] })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: expectedAccess }
      if (path === '/auth/profile') return { data: { ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:write', 'prices:read'] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await expect(fetchOwnAccessWithProfile(userId)).resolves.toEqual(expectedAccess)
    expect(useAuthStore.getState().user?.permissions).toEqual(['products:write', 'prices:read'])
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('reutiliza el EventSource por usuario, invalida acceso en mensaje y lo cierra al desmontar el último consumidor', () => {
    const client = new QueryClient()
    const source = {
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onmessage: null as ((event: MessageEvent<string>) => void) | null,
      onerror: null as (() => void) | null,
    }
    const createSource = vi.fn(() => source)
    const first = subscribeOwnAccessEvents('active-user', client, createSource)
    const second = subscribeOwnAccessEvents('active-user', client, createSource)
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()

    expect(createSource).toHaveBeenCalledTimes(1)
    source.onopen?.() // el evento inicial del servidor/reconexión obliga a leer el acceso otra vez
    expect(invalidate).toHaveBeenCalledTimes(1)
    source.onopen?.() // simula reconexión del mismo EventSource
    expect(invalidate).toHaveBeenCalledTimes(2)
    source.onmessage?.({ data: JSON.stringify({ type: 'access-changed' }) } as MessageEvent<string>)
    source.onmessage?.({ data: JSON.stringify({ type: 'heartbeat' }) } as MessageEvent<string>)
    expect(invalidate).toHaveBeenCalledTimes(3)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userAccessKey('active-user') })

    first()
    expect(source.close).not.toHaveBeenCalled()
    second()
    expect(source.close).toHaveBeenCalledTimes(1)
  })

  it('al cambiar accessVersion elimina datos cacheados de consultas protegidas, conservando la entrada propia', async () => {
    const client = new QueryClient()
    const userId = 'active-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:read'] })
    vi.mocked(api.get).mockReset()
    vi.mocked(api.get).mockResolvedValueOnce({ data: accessState({ accessVersion: 4 }) })
    await client.prefetchQuery({ queryKey: userAccessKey(userId), queryFn: () => fetchUserAccess(userId) })
    client.setQueryData(['products', 'private'], [{ id: 'p-1' }])
    const revised = accessState({ accessVersion: 5, grants: [] })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: revised }
      if (path === '/auth/profile') return { data: { ...ADMIN, id: userId, roles: ['Operador'], permissions: [] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await expect(fetchOwnAccessWithProfile(userId, client)).resolves.toEqual(revised)

    expect(client.getQueryData(['products', 'private'])).toBeUndefined()
    expect(client.getQueryData<UserAccessState>(userAccessKey(userId))?.accessVersion).toBe(4)
  })

  it('una concesión nueva de otro panel no elimina consultas de Biblioteca ni borradores activos', async () => {
    const client = new QueryClient()
    const userId = 'active-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:read'] })
    client.setQueryData(userAccessKey(userId), accessState({ accessVersion: 4 }))
    const editorDraft = { name: 'Nombre sin guardar' }
    client.setQueryData(['products', 'editor-draft'], editorDraft)
    client.setQueryData(['customers'], [{ id: 'c-1' }])
    const revised = accessState({ accessVersion: 5 })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: revised }
      if (path === '/auth/profile') return { data: { ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:read', 'customers:read'] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await fetchOwnAccessWithProfile(userId, client)

    expect(client.getQueryData(['products', 'editor-draft'])).toEqual(editorDraft)
    expect(client.getQueryData(['customers'])).toEqual([{ id: 'c-1' }])
  })

  it('una revocación de Biblioteca purga sus datos protegidos y conserva consultas de otros paneles', async () => {
    const client = new QueryClient()
    const userId = 'active-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:read', 'prices:read', 'customers:read'] })
    client.setQueryData(['products', 'detail', 'p-1'], { id: 'p-1', prices: [10] })
    client.setQueryData(['customers'], [{ id: 'c-1' }])
    const revised = accessState({ accessVersion: 5, grants: [{ sourceId: 's1', actionId: 'customers:read', scope: 'global' }] })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: revised }
      if (path === '/auth/profile') return { data: { ...ADMIN, id: userId, roles: ['Operador'], permissions: ['customers:read'] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await fetchOwnAccessWithProfile(userId, client)

    expect(client.getQueryData(['products', 'detail', 'p-1'])).toBeUndefined()
    expect(client.getQueryData(['customers'])).toEqual([{ id: 'c-1' }])
  })

  it('si falla /auth/profile, el acceso visual queda cerrado y la consulta se marca unavailable', async () => {
    const client = new QueryClient()
    const userId = 'active-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Super Admin'], permissions: ['products:read'] })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: accessState() }
      if (path === '/auth/profile') throw new Error('profile caído')
      throw new Error(`ruta inesperada: ${path}`)
    })

    await expect(client.fetchQuery({
      queryKey: userAccessKey(userId),
      queryFn: () => fetchOwnAccessWithProfile(userId, client),
      retry: false,
    })).rejects.toThrow('profile caído')

    expect(useAuthStore.getState().user?.roles).toEqual([])
    expect(useAuthStore.getState().user?.permissions).toEqual([])
    expect(client.getQueryState(userAccessKey(userId))?.status).toBe('error')
    expect(panelAccess({ roles: [], grants: null, status: 'unavailable' }, 'catalog').tabs).toEqual([])
  })

  it('si falla la lectura de concesiones tampoco conserva fallback permisivo del perfil previo', async () => {
    const userId = 'active-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Super Admin'], permissions: ['products:read'] })
    vi.mocked(api.get).mockRejectedValue(new Error('access caído'))

    await expect(fetchOwnAccessWithProfile(userId)).rejects.toThrow('access caído')

    expect(useAuthStore.getState().user?.roles).toEqual([])
    expect(useAuthStore.getState().user?.permissions).toEqual([])
  })

  it('una respuesta de perfil atrasada no sobrescribe una identidad nueva', async () => {
    const userId = 'previous-user'
    useAuthStore.getState().login({ ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:read'] })
    let resolveProfile!: (response: { data: { id: string; roles: string[]; permissions: string[]; email: string; name: string } }) => void
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === `/users/${userId}/access`) return Promise.resolve({ data: accessState() })
      if (path === '/auth/profile') return new Promise((resolve) => { resolveProfile = resolve })
      throw new Error(`ruta inesperada: ${path}`)
    })

    const pending = fetchOwnAccessWithProfile(userId)
    while (!resolveProfile) await Promise.resolve()
    useAuthStore.getState().login({ ...ADMIN, id: 'next-user', roles: ['Consulta'], permissions: ['quotes:read'] })
    resolveProfile({ data: { ...ADMIN, id: userId, roles: ['Operador'], permissions: ['products:write'] } })
    await pending

    expect(useAuthStore.getState().user?.id).toBe('next-user')
    expect(useAuthStore.getState().user?.permissions).toEqual(['quotes:read'])
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
    const userId = 'admin-1'
    useAuthStore.getState().login({ ...ADMIN, permissions: ['products:write', 'products:delete'] })
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
      if (path === '/auth/profile') return { data: { ...ADMIN, roles: ['Vendedor'], permissions: [] } }
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
    expect(useAuthStore.getState().user?.permissions).toEqual([])
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(client.getQueryState(userAccessKey(userId))?.isInvalidated).toBe(false)
  })

  it('aplicar un paquete también refetchea la caché compartida del menú', async () => {
    const client = new QueryClient()
    const userId = 'admin-1'
    useAuthStore.getState().login({ ...ADMIN, permissions: [] })
    const initialAccess = accessState({ grants: [], accessVersion: 0 })
    await seedMountedAccess(client, userId, initialAccess)

    vi.mocked(api.put).mockResolvedValue({
      data: { userId, sourceId: 'src-1', accessVersion: 1, changed: true, grants: [] },
    })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: accessState({ accessVersion: 1 }) }
      if (path === '/auth/profile') return { data: { ...ADMIN, permissions: ['products:write', 'prices:read'] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await applyPackageInCache(client, userId, 'vendedor', 0, initialAccess.catalogVersion)

    expect(api.put).toHaveBeenCalledWith(`/users/${userId}/access`, {
      packageId: 'vendedor',
      grants: [],
      expectedVersion: 0,
      expectedCatalogVersion: initialAccess.catalogVersion,
    })
    expect(client.getQueryData<UserAccessState>(userAccessKey(userId))?.accessVersion).toBe(1)
    expect(useAuthStore.getState().user?.permissions).toEqual(['products:write', 'prices:read'])
  })

  it('si el refetch de identidad falla, la sesión sigue viva y el acceso ya quedó refetcheado', async () => {
    const client = new QueryClient()
    const userId = 'admin-1'
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

describe('Biblioteca por casillas: pestañas según los permisos concedidos', () => {
  const sel = { id: 'sel', kind: 'template', templateId: 'biblioteca-seleccion' }
  const manual = { id: 'man', kind: 'manual', templateId: null }
  const input = (sourceId: string, actionIds: string[], sources = [sel, manual]) => ({
    roles: ['Consulta'],
    status: 'ready' as const,
    packages: [],
    sources,
    grants: actionIds.map((actionId) => ({ sourceId, actionId, scope: 'global' as const })),
  })

  it('la selección por casillas abre solo las pestañas que da (Productos / Fichas / Precios)', () => {
    expect(panelAccess(input('sel', ['products:read']), 'catalog').tabs.map((tab) => tab.to)).toEqual(['/commercial/products'])
    expect(panelAccess(input('sel', ['products:read', 'products:write']), 'catalog').tabs.map((tab) => tab.to))
      .toEqual(['/commercial/products', '/commercial/library/update/products'])
    expect(panelAccess(input('sel', ['prices:read', 'prices:preview']), 'catalog').tabs.map((tab) => tab.to))
      .toEqual(['/commercial/library/update'])
    expect(panelAccess(input('sel', ['products:read', 'prices:read', 'prices:preview', 'products:write']), 'catalog').tabs).toHaveLength(3)
  })

  it('permisos sueltos sin pestaña no la abren, y los de una fuente manual tampoco', () => {
    expect(panelAccess(input('sel', ['prices:read']), 'catalog').hasAnyPanel).toBe(false)
    expect(panelAccess(input('sel', ['prices:read', 'prices:apply']), 'catalog').hasAnyPanel).toBe(false)
    expect(panelAccess(input('man', ['products:read', 'products:write', 'prices:preview']), 'catalog').hasAnyPanel).toBe(false)
  })

  it('redirige a la primera pestaña que sí tiene; sin ninguna, nada', () => {
    expect(firstAssignedLibraryPath(input('sel', ['prices:read', 'prices:preview']))).toBe('/commercial/library/update')
    expect(firstAssignedLibraryPath(input('sel', []))).toBeNull()
    expect(hasAssignedLibraryPanel(input('sel', ['products:read']), 'biblioteca-fichas')).toBe(false)
    expect(hasAssignedLibraryPanel(input('sel', ['products:write']), 'biblioteca-fichas')).toBe(true)
  })

  it('no rompe los paquetes vigentes ni el paquete anterior', () => {
    const packaged = (id: string, actionId: string) => ({
      roles: ['Consulta'], status: 'ready' as const, sources: [],
      grants: [{ sourceId: 's', actionId, scope: 'global' as const }],
      packages: [{ id, applied: true }],
    })
    expect(hasAssignedLibraryPanel(packaged('biblioteca-actualizacion', 'products:write'), 'biblioteca-fichas')).toBe(true)
    expect(hasAssignedLibraryPanel(packaged('biblioteca-actualizacion', 'prices:preview'), 'biblioteca-precios')).toBe(true)
    expect(hasAssignedLibraryPanel(packaged('biblioteca-consulta', 'products:read'), 'biblioteca-consulta')).toBe(true)
  })

  it('Super Admin ve las cinco; mientras carga o falla, nadie las ve por rol', () => {
    expect(panelAccess({ roles: ['Super Admin'], status: 'loading' }, 'catalog').tabs).toHaveLength(5)
    expect(panelAccess({ ...input('sel', ['products:read']), status: 'unavailable' }, 'catalog').hasAnyPanel).toBe(false)
  })
})

describe('saveLibrarySelectionInCache', () => {
  it('envía las casillas con la versión, refetchea el acceso y la identidad en la misma sesión', async () => {
    const client = new QueryClient()
    const userId = 'admin-1'
    useAuthStore.getState().login({ ...ADMIN, permissions: [] })
    vi.mocked(api.get).mockReset()
    vi.mocked(api.get).mockResolvedValueOnce({ data: accessState({ accessVersion: 4 }) })
    await client.prefetchQuery({ queryKey: userAccessKey(userId), queryFn: () => fetchUserAccess(userId) })
    vi.mocked(api.put).mockResolvedValue({ data: { userId, sourceId: 'sel', accessVersion: 5, changed: true, grants: [] } })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === `/users/${userId}/access`) return { data: accessState({ accessVersion: 5 }) }
      if (path === '/auth/profile') return { data: { ...ADMIN, permissions: ['products:read'] } }
      throw new Error(`ruta inesperada: ${path}`)
    })

    await saveLibrarySelectionInCache(client, userId, ['products:read', 'products:write'], 4, 'panels-20261019-3')

    expect(api.put).toHaveBeenCalledWith(`/users/${userId}/access/library`, {
      actionIds: ['products:read', 'products:write'],
      expectedVersion: 4,
      expectedCatalogVersion: 'panels-20261019-3',
    })
    expect(client.getQueryData<UserAccessState>(userAccessKey(userId))?.accessVersion).toBe(5)
    expect(useAuthStore.getState().user?.permissions).toEqual(['products:read'])
  })

  it('si el servidor rechaza (400/409) el error llega tipado y no se refetchea la identidad', async () => {
    const client = new QueryClient()
    vi.mocked(api.get).mockClear()
    vi.mocked(api.put).mockRejectedValue({ response: { status: 400, data: { message: 'Quita primero Publicar en tienda: necesita poder editar fichas.' } } })
    await expect(saveLibrarySelectionInCache(client, 'admin-1', ['products:read'], 1))
      .rejects.toMatchObject({ code: 'invalid', message: 'Quita primero Publicar en tienda: necesita poder editar fichas.' })
    vi.mocked(api.put).mockRejectedValue({ response: { status: 409, data: { code: 'access-version-conflict', message: 'Cambiaron.' } } })
    await expect(saveLibrarySelectionInCache(client, 'admin-1', [], 1)).rejects.toMatchObject({ code: 'conflict' })
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('etiquetas del panel Marketing y mercadeo', () => {
  it('cada acción de marketing tiene su etiqueta en español simple', () => {
    expect(['read', 'create', 'edit', 'publish', 'delete'].map((action) => actionLabel(`marketing:${action}`))).toEqual([
      'Ver banners y pop-ups', 'Crear', 'Editar', 'Publicar y retirar', 'Eliminar',
    ])
  })
})
