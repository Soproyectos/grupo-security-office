import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'
import {
  fetchUserAccess,
  fetchUsers,
  fetchUsersPage,
  setUserAccessGrants,
  setUserLibrarySelection,
  UserAccessServiceError,
  userAccessErrorMessage,
} from './users.service'

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const ACCESS = {
  catalogVersion: 'panels-20261019-3',
  accessVersion: 3,
  grants: [
    { sourceId: 'src-1', actionId: 'customers:read', scope: 'own' },
    { sourceId: 'src-1', actionId: 'products:read', scope: 'global' },
  ],
  sources: [
    {
      id: 'src-1',
      kind: 'manual',
      templateId: null,
      catalogVersion: 'panels-20261019-3',
      grantedById: 'admin-1',
      reason: null,
    },
  ],
}

function httpError(status: number, data: unknown) {
  return { response: { status, data } }
}

describe('users.service — concesiones por acción (COM-01)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('pagina usuarios con el filtro y conserva el total para continuar cargando', async () => {
    const page = { data: [{ id: 'user-201', name: 'Persona de prueba' }], meta: { total: 201, skip: 200, take: 50 } }
    vi.mocked(api.get).mockResolvedValue({ data: page })
    expect(await fetchUsersPage(' Persona ', 50, 200)).toEqual(page)
    expect(api.get).toHaveBeenCalledWith('/users?take=50&skip=200&search=Persona')
  })

  it('conserva el contrato del selector de usuarios que solo consume la lista', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 'user-1' }], meta: { total: 1 } } })
    expect(await fetchUsers()).toEqual([{ id: 'user-1' }])
    expect(api.get).toHaveBeenCalledWith('/users?take=200')
  })

  it('fetchUserAccess devuelve el estado del servidor tal cual', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: ACCESS })

    const access = await fetchUserAccess('user-1')

    expect(api.get).toHaveBeenCalledWith('/users/user-1/access')
    expect(access.catalogVersion).toBe('panels-20261019-3')
    expect(access.accessVersion).toBe(3)
    expect(access.grants).toHaveLength(2)
    expect(access.sources[0]?.kind).toBe('manual')
    expect(access).not.toHaveProperty('packages')
  })

  it('el módulo ya no ofrece llamadas de paquetes: todo se asigna acción por acción', async () => {
    const service = await import('./users.service')
    expect(Object.keys(service).filter((name) => /package|paquete/i.test(name))).toEqual([])
  })

  it('setUserAccessGrants envía modo grants con la versión OCC', async () => {
    vi.mocked(api.put).mockResolvedValue({
      data: { userId: 'user-1', sourceId: 'src-2', accessVersion: 6, changed: true, grants: [] },
    })

    await setUserAccessGrants('user-1', [{ actionId: 'customers:read', scope: 'own' }], 5)

    expect(api.put).toHaveBeenCalledWith('/users/user-1/access', {
      grants: [{ actionId: 'customers:read', scope: 'own' }],
      expectedVersion: 5,
      expectedCatalogVersion: 'panels-20261125-1',
    })
  })

  it('mapea 400/401/403/404/409 a errores tipados con el mensaje del servidor', async () => {
    const cases = [
      [400, 'invalid'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not-found'],
      [409, 'conflict'],
    ] as const

    for (const [status, code] of cases) {
      vi.mocked(api.get).mockRejectedValue(httpError(status, { statusCode: status, message: `msg-${status}` }))
      const failure = await fetchUserAccess('user-1').catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(UserAccessServiceError)
      expect((failure as UserAccessServiceError).code).toBe(code)
      expect((failure as UserAccessServiceError).status).toBe(status)
      expect((failure as UserAccessServiceError).message).toBe(`msg-${status}`)
    }
  })

  it('409 conserva el código de conflicto del servidor cuando lo trae', async () => {
    vi.mocked(api.put).mockRejectedValue(
      httpError(409, {
        statusCode: 409,
        code: 'access-version-conflict',
        message: 'Las concesiones cambiaron',
      }),
    )

    const failure = await setUserAccessGrants('user-1', [], 1).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(UserAccessServiceError)
    expect((failure as UserAccessServiceError).code).toBe('conflict')
    expect((failure as UserAccessServiceError).serverCode).toBe('access-version-conflict')
  })

  it('un message de validación en array se une en un texto legible', async () => {
    vi.mocked(api.put).mockRejectedValue(
      httpError(400, {
        statusCode: 400,
        message: ['expectedCatalogVersion debe ser "panels-20261019-3".', 'Revisar.'],
      }),
    )

    const failure = await setUserAccessGrants('user-1', [], 0).catch((error: unknown) => error)

    expect(userAccessErrorMessage(failure)).toBe('expectedCatalogVersion debe ser "panels-20261019-3". Revisar.')
  })

  it('los errores de red sin respuesta se propagan sin envolver', async () => {
    const network = new Error('Network Error')
    vi.mocked(api.get).mockRejectedValue(network)

    await expect(fetchUserAccess('user-1')).rejects.toBe(network)
  })

  it('userAccessErrorMessage usa mensajes de reserva por estado cuando el servidor no manda texto', () => {
    expect(userAccessErrorMessage(httpError(409, { statusCode: 409 }))).toContain('cambiaron')
    expect(userAccessErrorMessage(httpError(403, { statusCode: 403 }))).toContain('Super Admin')
    expect(userAccessErrorMessage(httpError(404, { statusCode: 404 }))).toContain('existe')
  })
})

describe('setUserLibrarySelection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía las acciones marcadas con la versión OCC al endpoint de Biblioteca', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { userId: 'user-1', sourceId: 'sel', accessVersion: 4, changed: true, grants: [] } })
    const receipt = await setUserLibrarySelection('user-1', ['products:read'], 3, { catalogVersion: 'panels-20261028-2' })
    expect(api.put).toHaveBeenCalledWith('/users/user-1/access/library', {
      actionIds: ['products:read'], expectedVersion: 3, expectedCatalogVersion: 'panels-20261028-2',
    })
    expect(receipt.accessVersion).toBe(4)
  })

  it('traduce el 400 del servidor a un error tipado con su mensaje', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { status: 400, data: { message: 'Quita primero Publicar en tienda: necesita poder editar fichas.' } } })
    await expect(setUserLibrarySelection('user-1', [], 3)).rejects.toMatchObject({ code: 'invalid' })
  })
})
