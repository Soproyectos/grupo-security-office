import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { MenuCategory } from '../../types/categoryMenu'
import { categoryHref, featuredTiles, navigableRoots, nextRootId, resolveRootId } from './menu-model'
import { createMegaMenuStore, HOVER_INTENT_MS } from './menu-controller'
import MegaMenu from './MegaMenu'
import CategoryMenuContainer from './CategoryMenuContainer'

/**
 * No DOM environment and no @testing-library in the repo, so the suite is split
 * in two halves, the same way MENU-03 did:
 *
 * 1. The interaction rules (open/close, hover intent, keyboard, drill-down) are
 *    driven through the store the container uses, with fake timers, without a
 *    browser.
 * 2. What the user sees is asserted on server renders (`react-dom/server`) of
 *    the presentational tree: the markup carries the links, the states and the
 *    responsive classes. Events that only exist in the browser (the `keydown`
 *    listener on `document`, `focus()` and `scrollBy`) are the only part that
 *    cannot run here and are covered by reading the container wiring.
 */

const retryMock = vi.hoisted(() => vi.fn())
const menuMock = vi.hoisted(() => ({ status: 'ready', categories: [] as MenuCategory[], retry: retryMock }))

// The container reads the session store of `useCategoryMenu`, which is a module
// level singleton shared by every test of this file, so it is replaced by a
// fixed value to keep the trigger assertions independent.
vi.mock('../../hooks/useCategoryMenu', () => ({ useCategoryMenu: () => menuMock }))

// ---------------------------------------------------------------------------
// Fixture: the shape of the public menu (2 families + 2 flat library roots).
// ---------------------------------------------------------------------------

const tile = (id: string): string => `/images/categories/${id}.svg`

function node(
  id: string,
  name: string,
  slug: string,
  options: Partial<MenuCategory> & { featured?: boolean; children?: MenuCategory[] } = {},
): MenuCategory {
  const { featured = false, children = [], ...rest } = options
  return {
    id,
    name,
    slug,
    imageUrl: featured ? tile(slug) : (rest.imageUrl ?? null),
    iconUrl: rest.iconUrl ?? null,
    isFeatured: featured,
    sortOrder: rest.sortOrder ?? 0,
    children,
  }
}

const videovigilancia = node('r-vv', 'Videovigilancia', 'videovigilancia', {
  sortOrder: 10,
  iconUrl: '/images/category-icons/videovigilancia.svg',
  children: [
    node('c-camaras', 'Cámaras IP', 'camaras-ip', {
      children: [
        node('l-domo', 'Domo', 'camaras-ip-domo', { featured: true }),
        node('l-bala', 'Bala', 'camaras-ip-bala', { featured: true }),
        node('l-ptz', 'PTZ', 'camaras-ip-ptz', { featured: true }),
        node('l-fisheye', 'Fisheye', 'camaras-ip-fisheye'),
      ],
    }),
    node('c-grabadores', 'Grabadores', 'grabadores', {
      children: [node('l-nvr', 'NVR', 'grabadores-nvr', { featured: true })],
    }),
    node('c-kits', 'Kits CCTV', 'kits-cctv', {
      featured: true,
      children: [node('l-kit4', 'Kit 4 cámaras', 'kit-4-camaras')],
    }),
    node('c-accesorios', 'Accesorios CCTV', 'accesorios-cctv', {
      children: [node('l-discos', 'Discos duros', 'accesorios-cctv-discos-duros', { featured: true })],
    }),
  ],
})

const acceso = node('r-acceso', 'Control de Acceso', 'control-de-acceso', {
  sortOrder: 20,
  iconUrl: '/images/category-icons/control-de-acceso.svg',
  children: [
    node('c-biometricos', 'Biométricos', 'biometricos', {
      children: [
        node('l-huella', 'Huella', 'biometricos-huella', { featured: true }),
        node('l-facial', 'Reconocimiento facial', 'biometricos-reconocimiento-facial', { featured: true }),
      ],
    }),
    node('c-torniquetes', 'Torniquetes y barreras', 'torniquetes-y-barreras', { featured: true }),
  ],
})

/** Flat roots coming from the library import: no children, `sortOrder` 0. */
const cablesUtp = node('f-cables', 'Cables UTP', 'cables-utp')
const herramientas = node('f-herramientas', 'Herramientas', 'herramientas')

const menu: MenuCategory[] = [cablesUtp, videovigilancia, herramientas, acceso]
const roots = navigableRoots(menu)

function renderMenu(props: Partial<Parameters<typeof MegaMenu>[0]> = {}): string {
  const defaults: Parameters<typeof MegaMenu>[0] = {
    status: 'ready',
    roots,
    selectedRoot: videovigilancia,
    selectedId: videovigilancia.id,
    view: 'roots',
    onSelect: () => {},
    onHover: () => {},
    onLeave: () => {},
    onKeyDown: () => {},
    onOpenDetail: () => {},
    onBack: () => {},
    onClose: () => {},
    onRetry: () => {},
  }
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(MegaMenu, { ...defaults, ...props })),
  )
}

/** Number of times a substring shows up in the markup. */
function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

beforeEach(() => {
  menuMock.status = 'ready'
  menuMock.categories = menu
  retryMock.mockReset()
})

describe('menu-model', () => {
  it('arma la ruta de la página de categoría', () => {
    expect(categoryHref('videovigilancia')).toBe('/catalogo/categoria/videovigilancia')
  })

  /**
   * The 41 roots the endpoint returns include 35 flat categories from the
   * library import. A root without children has no columns to show, so it does
   * not take a row of the sidebar.
   */
  it('deja como raíces navegables solo las que tienen subcategorías', () => {
    expect(roots.map((root) => root.id)).toEqual(['r-vv', 'r-acceso'])
    expect(menu).toHaveLength(4)
  })

  it('mantiene la raíz elegida si sigue existiendo y si no cae en la primera', () => {
    expect(resolveRootId(roots, 'r-acceso')).toBe('r-acceso')
    expect(resolveRootId(roots, 'borrada')).toBe('r-vv')
    expect(resolveRootId(roots, null)).toBe('r-vv')
    expect(resolveRootId([], 'r-vv')).toBeNull()
  })

  it('reúne las portadas destacadas de la familia en orden de árbol', () => {
    expect(featuredTiles(videovigilancia).map((tileNode) => tileNode.slug)).toEqual([
      'camaras-ip-domo',
      'camaras-ip-bala',
      'camaras-ip-ptz',
      'grabadores-nvr',
      'kits-cctv',
      'accesorios-cctv-discos-duros',
    ])
    expect(featuredTiles(acceso).map((tileNode) => tileNode.slug)).toEqual([
      'biometricos-huella',
      'biometricos-reconocimiento-facial',
      'torniquetes-y-barreras',
    ])
    expect(featuredTiles(null)).toEqual([])
  })

  it('navega entre raíces con las flechas y devuelve null en otras teclas', () => {
    expect(nextRootId(roots, 'r-vv', 'ArrowDown')).toBe('r-acceso')
    expect(nextRootId(roots, 'r-acceso', 'ArrowDown')).toBe('r-vv')
    expect(nextRootId(roots, 'r-vv', 'ArrowUp')).toBe('r-acceso')
    expect(nextRootId(roots, 'r-acceso', 'Home')).toBe('r-vv')
    expect(nextRootId(roots, 'r-vv', 'End')).toBe('r-acceso')
    expect(nextRootId(roots, 'r-vv', 'a')).toBeNull()
    expect(nextRootId([], 'r-vv', 'ArrowDown')).toBeNull()
  })
})

describe('store del mega menú', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function openStore() {
    const store = createMegaMenuStore()
    store.setRoots(roots)
    store.open()
    return store
  }

  it('abre, cierra y vuelve a abrir con el mismo disparador', () => {
    const store = createMegaMenuStore()
    store.setRoots(roots)

    expect(store.getState()).toEqual({ open: false, rootId: 'r-vv', view: 'roots', returnFocus: false })

    store.toggle()
    expect(store.getState().open).toBe(true)

    store.toggle()
    expect(store.getState().open).toBe(false)

    store.open()
    expect(store.getState().open).toBe(true)
  })

  it('pide el foco de vuelta al cerrar pero no al cambiar de ruta', () => {
    const store = openStore()

    store.close()
    expect(store.getState().returnFocus).toBe(true)

    store.open()
    store.close(false)
    expect(store.getState().returnFocus).toBe(false)
  })

  it('cerrar un menú ya cerrado no notifica nada', () => {
    const store = createMegaMenuStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.close()

    expect(listener).not.toHaveBeenCalled()
  })

  it('avisa a los suscriptores mientras siga suscrito', () => {
    const store = createMegaMenuStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.setRoots(roots)
    store.open()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.close()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('cambia de raíz al seleccionar, al enfocar y con las flechas', () => {
    const store = openStore()

    store.select('r-acceso')
    expect(store.getState().rootId).toBe('r-acceso')

    expect(store.move('ArrowUp')).toBe('r-vv')
    expect(store.getState().rootId).toBe('r-vv')

    expect(store.move('Enter')).toBeNull()
    expect(store.getState().rootId).toBe('r-vv')
  })

  it('deja la selección en la primera raíz si la elegida desaparece', () => {
    const store = openStore()
    store.select('r-acceso')

    store.setRoots([videovigilancia])

    expect(store.getState().rootId).toBe('r-vv')
  })

  /**
   * Hover intent: the columns must not flicker while the pointer crosses the
   * sidebar, so the switch waits for the pointer to rest on the root.
   */
  it('espera el hover-intent antes de cambiar de raíz', () => {
    const store = openStore()

    store.hover('r-acceso')
    vi.advanceTimersByTime(HOVER_INTENT_MS - 1)
    expect(store.getState().rootId).toBe('r-vv')

    vi.advanceTimersByTime(1)
    expect(store.getState().rootId).toBe('r-acceso')
  })

  it('cancela el hover pendiente al salir de la raíz', () => {
    const store = openStore()

    store.hover('r-acceso')
    store.leave()
    vi.advanceTimersByTime(HOVER_INTENT_MS)

    expect(store.getState().rootId).toBe('r-vv')
  })

  it('reinicia la espera cuando el puntero pasa a otra raíz', () => {
    const store = openStore()

    store.hover('r-acceso')
    vi.advanceTimersByTime(HOVER_INTENT_MS - 1)
    store.hover('r-vv')
    store.hover('r-acceso')
    vi.advanceTimersByTime(HOVER_INTENT_MS - 1)
    expect(store.getState().rootId).toBe('r-vv')

    vi.advanceTimersByTime(1)
    expect(store.getState().rootId).toBe('r-acceso')
  })

  it('no programa hover con el menú cerrado ni sobre la raíz ya seleccionada', () => {
    const store = createMegaMenuStore()
    store.setRoots(roots)

    store.hover('r-acceso')
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(store.getState().rootId).toBe('r-vv')

    store.open()
    store.hover('r-vv')
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(store.getState().rootId).toBe('r-vv')
  })

  it('descarta el hover pendiente al cerrar o al abrir el detalle móvil', () => {
    const store = openStore()

    store.hover('r-acceso')
    store.close()
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(store.getState().rootId).toBe('r-vv')

    store.open()
    store.hover('r-acceso')
    store.openRootDetail('r-vv')
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(store.getState().rootId).toBe('r-vv')
  })

  it('abre y retrocede el drill-down móvil, y cerrar lo reinicia', () => {
    const store = openStore()

    store.openRootDetail('r-acceso')
    expect(store.getState()).toMatchObject({ rootId: 'r-acceso', view: 'detail' })

    store.back()
    expect(store.getState().view).toBe('roots')

    store.openRootDetail('r-acceso')
    store.close()
    expect(store.getState().view).toBe('roots')

    store.open()
    store.back()
    expect(store.getState().view).toBe('roots')
  })
})

describe('mega menu en el escritorio', () => {
  it('lista solo las familias con subcategorías y marca la seleccionada', () => {
    const markup = renderMenu()

    // Solo la barra lateral de escritorio lleva `data-root-id` y `aria-current`:
    // el cajón móvil abre el detalle con un botón por familia.
    expect(occurrences(markup, 'data-root-id=')).toBe(2)
    expect(occurrences(markup, 'aria-current="true"')).toBe(1)
    expect(markup).toContain('Videovigilancia')
    expect(markup).toContain('Control de Acceso')
    expect(markup).not.toContain('Cables UTP')
    expect(markup).not.toContain('Herramientas')
  })

  it('pinta el icono de la raíz como máscara del color del texto', () => {
    const markup = renderMenu()

    expect(markup).toContain('bg-current')
    expect(markup).toMatch(/mask-image:url\((&quot;|')?\/images\/category-icons\/videovigilancia\.svg/)
    expect(markup).toContain('mask-size:contain')
  })

  it('enlaza cada columna y cada hoja a su página de categoría', () => {
    const markup = renderMenu()

    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip-domo"')
    expect(markup).toContain('href="/catalogo/categoria/kit-4-camaras"')
    expect(markup).toContain('grid grid-cols-5 gap-x-8')
  })

  it('muestra la fila de círculos con las portadas destacadas y su flecha', () => {
    const markup = renderMenu()

    expect(markup).toContain('hidden items-center gap-3 lg:flex')
    expect(occurrences(markup, 'rounded-full border border-security-500')).toBe(6)
    expect(occurrences(markup, 'snap-x snap-mandatory')).toBe(1)
    expect(markup).toContain('aria-label="Ver más categorías destacadas"')
    expect(markup).toContain('src="/images/categories/camaras-ip-domo.svg"')
    // The circles are desktop only: the mobile drawer must not carry them.
    expect(occurrences(markup, 'aria-label="Categorías destacadas"')).toBe(1)
  })

  it('ofrece el catálogo completo para las categorías planas que no son familia', () => {
    expect(renderMenu()).toContain('href="/catalogo"')
  })
  it('cambia las columnas al cambiar la raíz seleccionada', () => {
    const markup = renderMenu({ selectedRoot: acceso, selectedId: acceso.id })

    expect(markup).toContain('Categorías de Control de Acceso')
    expect(markup).toContain('href="/catalogo/categoria/biometricos"')
    expect(markup).not.toContain('href="/catalogo/categoria/camaras-ip-domo"')
  })
})

describe('estados del mega menú', () => {
  it('muestra el esqueleto mientras carga', () => {
    const markup = renderMenu({ status: 'loading' })

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Cargando categorías')
    expect(markup).toContain('animate-pulse')
    // The skeleton keeps the shape of the panel: a sidebar of pills...
    expect(markup).toContain('border-r border-surface-200 bg-surface-50 p-3')
    // ...and no real root yet.
    expect(markup).not.toContain('data-root-id=')
  })

  it('muestra el error con un único botón de reintento', () => {
    const markup = renderMenu({ status: 'error' })

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('No pudimos cargar las categorías')
    // One shell for both breakpoints: the live region is announced once.
    expect(occurrences(markup, 'Reintentar')).toBe(1)
  })

  it('el botón Reintentar queda disponible sin disparar nada al renderizar', () => {
    const onRetry = vi.fn()
    const markup = renderMenu({ status: 'error', onRetry })

    expect(markup).toContain('Reintentar')
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('avisa cuando no hay ninguna familia que mostrar', () => {
    const markup = renderMenu({ roots: [], selectedRoot: null, selectedId: null })

    expect(markup).toContain('Todavía no hay categorías para mostrar')
    expect(markup).toContain('href="/catalogo"')
  })
})

describe('cajón móvil', () => {
  it('lista las familias en el primer paso', () => {
    const markup = renderMenu({ view: 'roots' })

    expect(markup).toContain('Categorías')
    expect(markup).toContain('Control de Acceso')
    expect(markup).not.toContain('Volver')
    expect(markup).not.toContain('<details')
  })

  it('muestra las columnas de la familia elegida con botón de volver', () => {
    const markup = renderMenu({ view: 'detail', selectedRoot: acceso, selectedId: acceso.id })

    expect(markup).toContain('Volver')
    expect(markup).toContain('Ver Control de Acceso')
    expect(markup).toContain('href="/catalogo/categoria/biometricos"')
    expect(markup).toContain('href="/catalogo/categoria/biometricos-huella"')
    // A leaf level-2 is a plain link; one with children is an accordion.
    expect(occurrences(markup, '<details')).toBe(1)
    expect(markup).toContain('href="/catalogo/categoria/torniquetes-y-barreras"')
  })

  it('no se renderiza en escritorio', () => {
    expect(renderMenu()).toContain('flex h-full flex-col bg-white lg:hidden')
  })
})

describe('integración con el disparador del header', () => {
  it('el botón Categorías arranca cerrado y anuncia la región que controla', () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(CategoryMenuContainer)),
    )

    expect(markup).toContain('Categorías')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    // Closed: the region and the backdrop are not in the DOM yet.
    expect(markup).not.toContain('id="category-mega-menu"')
  })
})
