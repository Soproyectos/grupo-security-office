import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuCategory } from '../types/categoryMenu'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('../../../services/public-catalog.service', () => ({ fetchCategoryMenu: fetchMock }))

// ---------------------------------------------------------------------------
// Covered scenarios:
// ✅ Initial `loading` state without touching the network
// ✅ loading → ready with the tree returned by the service
// ✅ Module cache: several "mounts" of the hook → a single request
// ✅ Error: publishes `error` and empties the categories (must stay retryable)
// ✅ `retry()` drops the cache and fetches again, after `ready` and after `error`
// ✅ A stale response does not overwrite the current attempt
// ✅ An unmounted consumer stops receiving notifications
// ✅ The React hook reads the store state (server render, no effects)
//
// Note: the repo has no DOM environment and no @testing-library installed, so the
// hook is exercised through the store it consumes (`useSyncExternalStore`) instead
// of being mounted with RTL. Every case reloads the module to start from a clean
// cache, the way a new session would.
// ---------------------------------------------------------------------------

const menu: MenuCategory[] = [
  {
    id: 'root-1',
    name: 'Videovigilancia',
    slug: 'videovigilancia',
    imageUrl: '/images/categories/videovigilancia.svg',
    iconUrl: '/images/categories/icons/videovigilancia.svg',
    isFeatured: false,
    sortOrder: 10,
    children: [
      {
        id: 'child-1',
        name: 'Cámaras IP',
        slug: 'cameras-ip',
        imageUrl: null,
        iconUrl: null,
        isFeatured: true,
        sortOrder: 0,
        children: [],
      },
    ],
  },
  {
    id: 'root-2',
    name: 'Control de acceso',
    slug: 'control-de-acceso',
    imageUrl: null,
    iconUrl: null,
    isFeatured: false,
    sortOrder: 20,
    children: [],
  },
]

const otroMenu: MenuCategory[] = [
  {
    id: 'root-3',
    name: 'Alarmas',
    slug: 'alarmas',
    imageUrl: null,
    iconUrl: null,
    isFeatured: false,
    sortOrder: 30,
    children: [],
  },
]

type MenuStore = typeof import('./useCategoryMenu')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function loadStore(): Promise<MenuStore> {
  vi.resetModules()
  return import('./useCategoryMenu')
}

describe('caché de sesión del menú', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('arranca en loading sin pedir nada', async () => {
    const store = await loadStore()

    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'loading', categories: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pasa de loading a ready cuando la petición resuelve', async () => {
    const store = await loadStore()
    const request = deferred<MenuCategory[]>()
    fetchMock.mockReturnValue(request.promise)

    const estados: string[] = []
    store.subscribeCategoryMenu(() => estados.push(store.getCategoryMenuSnapshot().status))

    const loading = store.loadCategoryMenu()
    expect(store.getCategoryMenuSnapshot().status).toBe('loading')
    expect(store.getCategoryMenuSnapshot().categories).toEqual([])

    request.resolve(menu)
    await loading

    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'ready', categories: menu })
    expect(estados).toEqual(['loading', 'ready'])
  })

  /**
   * The central MENU-03 requirement: the header mega menu, the mobile drawer
   * and the category page mount separately and all read the same store, so the
   * network is touched once per session.
   */
  it('varios consumidores en la misma sesión disparan una sola petición', async () => {
    const store = await loadStore()
    const request = deferred<MenuCategory[]>()
    fetchMock.mockReturnValue(request.promise)

    const unsubscribeA = store.subscribeCategoryMenu(() => {})
    const unsubscribeB = store.subscribeCategoryMenu(() => {})

    const primera = store.loadCategoryMenu()
    const segunda = store.loadCategoryMenu()

    request.resolve(menu)
    await Promise.all([primera, segunda])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.getCategoryMenuSnapshot().status).toBe('ready')

    // Mounting again with the menu already cached must not refetch.
    await store.loadCategoryMenu()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unsubscribeA()
    unsubscribeB()
  })

  it('publica error y vacía las categorías cuando la petición falla', async () => {
    const store = await loadStore()
    fetchMock.mockRejectedValue(new Error('Request failed with status code 500'))

    await store.loadCategoryMenu()

    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'error', categories: [] })
  })

  it('retry() limpia la caché y vuelve a pedir tras un ready', async () => {
    const store = await loadStore()
    fetchMock.mockResolvedValueOnce(menu)
    await store.loadCategoryMenu()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const segunda = deferred<MenuCategory[]>()
    fetchMock.mockReturnValueOnce(segunda.promise)
    store.retryCategoryMenu()

    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'loading', categories: [] })

    segunda.resolve(otroMenu)
    await store.loadCategoryMenu()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'ready', categories: otroMenu })
  })

  it('retry() tras un error vuelve a dejar el menú listo', async () => {
    const store = await loadStore()
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await store.loadCategoryMenu()
    expect(store.getCategoryMenuSnapshot().status).toBe('error')

    fetchMock.mockResolvedValueOnce(menu)
    store.retryCategoryMenu()
    await store.loadCategoryMenu()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'ready', categories: menu })
  })

  it('una respuesta obsoleta no pisa el estado del intento vigente', async () => {
    const store = await loadStore()
    const lento = deferred<MenuCategory[]>()
    const rapido = deferred<MenuCategory[]>()
    fetchMock.mockReturnValueOnce(lento.promise).mockReturnValueOnce(rapido.promise)

    store.loadCategoryMenu()
    store.retryCategoryMenu()

    rapido.resolve(menu)
    await store.loadCategoryMenu()
    expect(store.getCategoryMenuSnapshot().status).toBe('ready')

    lento.resolve([])
    await lento.promise
    await Promise.resolve()

    expect(store.getCategoryMenuSnapshot()).toEqual({ status: 'ready', categories: menu })
  })

  it('un consumidor descargado deja de recibir notificaciones', async () => {
    const store = await loadStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribeCategoryMenu(listener)
    unsubscribe()

    fetchMock.mockResolvedValue(menu)
    await store.loadCategoryMenu()

    expect(listener).not.toHaveBeenCalled()
    expect(store.getCategoryMenuSnapshot().status).toBe('ready')
  })
})

describe('useCategoryMenu', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  /**
   * Server render: `useEffect` does not run, so the hook must return the store
   * state as is and must not trigger the load. React is imported in the same
   * batch as the hook so renderer and hook share the same dispatcher instance.
   */
  it('expone el estado del store sin pedir datos durante el render', async () => {
    vi.resetModules()
    const [store, server, react] = await Promise.all([
      import('./useCategoryMenu'),
      import('react-dom/server'),
      import('react'),
    ])

    function Probe() {
      const menuState = store.useCategoryMenu()
      return react.createElement(
        'span',
        null,
        `${menuState.status}|${menuState.categories.length}|${typeof menuState.retry}`,
      )
    }

    const markup = server.renderToStaticMarkup(react.createElement(Probe))

    expect(markup).toBe('<span>loading|0|function</span>')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.getCategoryMenuSnapshot().status).toBe('loading')
  })

  it('entrega las categorías ya cargadas al componente', async () => {
    vi.resetModules()
    const [store, server, react] = await Promise.all([
      import('./useCategoryMenu'),
      import('react-dom/server'),
      import('react'),
    ])

    fetchMock.mockResolvedValue(menu)
    await store.loadCategoryMenu()

    function Probe() {
      const menuState = store.useCategoryMenu()
      return react.createElement('span', null, `${menuState.status}|${menuState.categories.length}`)
    }

    const markup = server.renderToStaticMarkup(react.createElement(Probe))

    expect(markup).toBe('<span>ready|2</span>')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
