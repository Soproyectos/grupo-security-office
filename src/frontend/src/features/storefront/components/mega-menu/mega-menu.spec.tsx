import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { MenuCategory } from '../../types/categoryMenu'
import {
  categoryHref,
  categoryNodeHref,
  featuredTiles,
  hasForwardOverflow,
  navigableRoots,
  nextRootId,
  productCountLabel,
  resolveRootId,
} from './menu-model'
import { categoryImage } from './menu-images'
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
  const { featured = false, children = [], productCount = featured ? 1 : 0, ...rest } = options
  return {
    id,
    name,
    slug,
    imageUrl: featured ? tile(slug) : (rest.imageUrl ?? null),
    iconUrl: rest.iconUrl ?? null,
    isFeatured: featured,
    sortOrder: rest.sortOrder ?? 0,
    productCount,
    ...(rest.subcategoryId ? { subcategoryId: rest.subcategoryId } : {}),
    ...(rest.subcategorySlug ? { subcategorySlug: rest.subcategorySlug } : {}),
    children,
  }
}

const videovigilancia = node('r-vv', 'Videovigilancia', 'videovigilancia', {
  sortOrder: 10,
  productCount: 378,
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
  productCount: 1,
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
/** Flat root with products and a bundled photo: listed even without children. */
const cableado = node('f-cableado', 'Cableado', 'cableado', { productCount: 12 })

const menu: MenuCategory[] = [cablesUtp, videovigilancia, cableado, herramientas, acceso]
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

  it('lista todas las raíces con productos y deja fuera las de 0 productos', () => {
    expect(roots.map((root) => root.id)).toEqual(['r-vv', 'f-cableado', 'r-acceso'])
    expect(menu).toHaveLength(5)
  })

  it('arma el texto singular y plural del conteo', () => {
    expect(productCountLabel(1)).toBe('1 producto')
    expect(productCountLabel(378)).toBe('378 productos')
    expect(productCountLabel(0)).toBe('0 productos')
  })

  it('arma rutas filtradas para una subcategoría persistida y rutas normales para categorías', () => {
    const subcategory = node('sub-ip', 'Cámaras IP y Wi-Fi', 'legacy-ip-row', { subcategoryId: 'sub-ip', subcategorySlug: 'camaras-ip-wifi' })
    const category = node('cat-ip', 'Videovigilancia', 'videovigilancia')

    expect(categoryNodeHref(subcategory, 'camaras')).toBe('/catalogo/categoria/camaras?tipo=camaras-ip-wifi')
    expect(categoryNodeHref(category, 'camaras')).toBe('/catalogo/categoria/videovigilancia')
  })

  it('la foto sale del backend, luego del mapa por slug y si no es null', () => {
    expect(categoryImage({ slug: 'camaras', imageUrl: '/api/x.jpg' })).toBe('/api/x.jpg')
    expect(categoryImage({ slug: 'camaras', imageUrl: null })).toBe('/images/menu/camaras.jpg')
    expect(categoryImage({ slug: 'otra', imageUrl: null })).toBeNull()
    expect(categoryImage({ slug: 'constructor', imageUrl: null })).toBeNull()
  })

  it('muestra todas las raíces recibidas cuando ninguna tiene hijas', () => {
    const emptyCatalogRoots = Array.from({ length: 9 }, (_, index) =>
      node(`root-${index + 1}`, `Familia ${index + 1}`, `familia-${index + 1}`),
    )

    expect(navigableRoots(emptyCatalogRoots)).toEqual(emptyCatalogRoots)
  })

  it('devuelve una lista vacía si no hay raíces', () => {
    expect(navigableRoots([])).toEqual([])
  })

  it('mantiene la raíz elegida y, sin selección, prioriza la que tiene subcategorías', () => {
    expect(resolveRootId(roots, 'r-acceso')).toBe('r-acceso')
    expect(resolveRootId(roots, 'borrada')).toBe('r-vv')
    expect(resolveRootId(roots, null)).toBe('r-vv')
    expect(resolveRootId([cableado, videovigilancia], null)).toBe('r-vv')
    expect(resolveRootId([cableado, videovigilancia], cableado.id)).toBe(cableado.id)
    expect(resolveRootId([cableado], null)).toBe(cableado.id)
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
    expect(nextRootId(roots, 'r-vv', 'ArrowDown')).toBe('f-cableado')
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

    expect(store.move('ArrowUp')).toBe('f-cableado')
    expect(store.getState().rootId).toBe('f-cableado')

    expect(store.move('Enter')).toBeNull()
    expect(store.getState().rootId).toBe('f-cableado')
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
  it('lista las raíces con productos y marca la seleccionada', () => {
    const markup = renderMenu()

    // Solo la barra lateral de escritorio lleva `data-root-id` y `aria-current`:
    // el cajón móvil abre el detalle con un botón por familia.
    expect(occurrences(markup, 'data-root-id=')).toBe(3)
    expect(occurrences(markup, 'aria-current="true"')).toBe(1)
    expect(markup).toContain('Videovigilancia')
    expect(markup).toContain('Control de Acceso')
    expect(markup).not.toContain('Cables UTP')
    expect(markup).not.toContain('Herramientas')
  })

  it('muestra la miniatura y el conteo de cada raíz en la lista', () => {
    const markup = renderMenu()

    expect(markup).toContain('src="/images/menu/cableado.jpg"')
    expect(markup).toContain('378 productos')
    expect(markup).toContain('1 producto<')
  })

  it('muestra el título, Ver todo con el conteo y la foto grande de la raíz', () => {
    const markup = renderMenu({ selectedRoot: cableado, selectedId: cableado.id })

    expect(markup).toContain('Ver todos los productos')
    expect(markup).toContain('12 productos')
    expect(markup).toContain('aspect-[4/3] w-56')
    // Thumbnail in the list plus the large photo.
    expect(occurrences(markup, 'src="/images/menu/cableado.jpg"')).toBe(2)
    expect(markup).not.toContain('Subcategorías de Cableado')
  })

  it('usa el singular cuando la raíz tiene un solo producto', () => {
    const markup = renderMenu({ selectedRoot: acceso, selectedId: acceso.id })

    expect(markup).toContain('Ver todo (1 producto)')
  })

  it('una raíz sin foto da espacio a la lista de subcategorías', () => {
    const markup = renderMenu({ selectedRoot: videovigilancia, selectedId: videovigilancia.id })

    expect(markup).toContain('Ver todo (378 productos)')
    expect(markup).toContain('aria-label="Subcategorías de Videovigilancia" class="flex flex-wrap')
    expect(markup).not.toContain('/images/menu/videovigilancia.jpg')
  })

  it('enlaza la raíz y cada subcategoría a su página de categoría', () => {
    const markup = renderMenu()

    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('href="/catalogo/categoria/grabadores"')
    expect(markup).toContain('Subcategorías de Videovigilancia')
  })

  it('muestra la fila de círculos con las portadas destacadas', () => {
    const markup = renderMenu()

    expect(markup).toContain('hidden items-center gap-3 lg:flex')
    expect(occurrences(markup, 'rounded-full border border-security-500')).toBe(6)
    expect(occurrences(markup, 'snap-x snap-mandatory')).toBe(1)
    expect(markup).toContain('src="/images/categories/camaras-ip-domo.svg"')
    // The circles are desktop only: the mobile drawer must not carry them.
    expect(occurrences(markup, 'aria-label="Categorías destacadas"')).toBe(1)
    // The arrow only renders after the browser measures an overflow, so it is
    // never part of the static markup (and never an idle button).
    expect(markup).not.toContain('Ver más categorías destacadas')
  })

  it('la flecha solo aparece mientras quedan círculos por ver', () => {
    const track = (over: { scrollLeft?: number; clientWidth?: number; scrollWidth?: number }) =>
      ({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400, ...over }) as HTMLElement

    // Fits on screen: nothing to scroll.
    expect(hasForwardOverflow(track({}))).toBe(false)
    // Overflows from the start.
    expect(hasForwardOverflow(track({ scrollWidth: 900 }))).toBe(true)
    // Mid scroll: covers still hidden on the right.
    expect(hasForwardOverflow(track({ scrollWidth: 900, scrollLeft: 400 }))).toBe(true)
    // End of the row reached: hide the arrow again.
    expect(hasForwardOverflow(track({ scrollWidth: 900, scrollLeft: 500 }))).toBe(false)
  })

  it('ofrece el catálogo completo para las categorías planas que no son familia', () => {
    expect(renderMenu()).toContain('href="/catalogo"')
  })
  it('cambia las columnas al cambiar la raíz seleccionada', () => {
    const markup = renderMenu({ selectedRoot: acceso, selectedId: acceso.id })

    expect(markup).toContain('Subcategorías de Control de Acceso')
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
  it('el disparador del header arranca cerrado y anuncia la región que controla', () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(CategoryMenuContainer, { triggerClassName: 'nav-item', triggerContent: 'Catálogo' }),
      ),
    )

    expect(markup).toContain('class="nav-item"')
    expect(markup).toContain('Catálogo')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    // Closed: the region and the backdrop are not in the DOM yet.
    expect(markup).not.toContain('id="category-mega-menu"')
  })
})
