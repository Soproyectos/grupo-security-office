import type { MenuCategory } from '../../types/categoryMenu'
import { nextRootId, resolveRootId } from './menu-model'

/** Which step of the mobile drill-down is on screen. */
export type MegaMenuView = 'roots' | 'detail'

export interface MegaMenuState {
  open: boolean
  rootId: string | null
  view: MegaMenuView
  /** The trigger must take the focus back after a dismissal. */
  returnFocus: boolean
}

/**
 * Hover intent: the pointer has to rest on a root before the columns switch,
 * otherwise the columns would flicker while the pointer crosses the sidebar.
 */
export const HOVER_INTENT_MS = 120

export interface MegaMenuStore {
  getState: () => MegaMenuState
  subscribe: (listener: () => void) => () => void
  /** Replaces the roots the store navigates over (the tree arrives async). */
  setRoots: (roots: MenuCategory[]) => void
  open: () => void
  close: (returnFocus?: boolean) => void
  toggle: () => void
  select: (rootId: string) => void
  hover: (rootId: string) => void
  leave: () => void
  /** Moves the selection with the arrow keys and returns the reached root. */
  move: (key: string) => string | null
  openRootDetail: (rootId: string) => void
  back: () => void
}

const INITIAL_STATE: MegaMenuState = { open: false, rootId: null, view: 'roots', returnFocus: false }

/**
 * Interaction rules of the mega menu, kept out of the components: the DOM only
 * wires events to these methods. Being a plain external store it can be driven
 * without a browser, which is how the open/close, hover-intent and keyboard
 * behaviour is covered by the suite.
 */
export function createMegaMenuStore(): MegaMenuStore {
  let state: MegaMenuState = INITIAL_STATE
  let roots: MenuCategory[] = []
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  function publish(next: MegaMenuState): void {
    state = next
    for (const listener of [...listeners]) listener()
  }

  function patch(next: Partial<MegaMenuState>): void {
    publish({ ...state, ...next })
  }

  function cancelHover(): void {
    if (hoverTimer === null) return
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  function selectRoot(rootId: string): void {
    if (state.rootId === rootId) return
    patch({ rootId })
  }

  function openMenu(): void {
    if (state.open) return
    patch({ open: true, returnFocus: false, rootId: resolveRootId(roots, state.rootId) })
  }

  function closeMenu(returnFocus = true): void {
    cancelHover()
    if (!state.open) return
    patch({ open: false, view: 'roots', returnFocus })
  }

  return {
    getState: () => state,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    setRoots: (next) => {
      roots = next
      const rootId = resolveRootId(next, state.rootId)
      if (rootId !== state.rootId) patch({ rootId })
    },

    open: openMenu,

    close: closeMenu,

    toggle: () => {
      if (state.open) closeMenu()
      else openMenu()
    },

    select: selectRoot,

    hover: (rootId) => {
      cancelHover()
      if (!state.open || state.rootId === rootId) return
      hoverTimer = setTimeout(() => {
        hoverTimer = null
        selectRoot(rootId)
      }, HOVER_INTENT_MS)
    },

    leave: cancelHover,

    move: (key) => {
      const currentId = resolveRootId(roots, state.rootId)
      const targetId = nextRootId(roots, currentId, key)
      if (targetId === null) return null
      selectRoot(targetId)
      return targetId
    },

    openRootDetail: (rootId) => {
      cancelHover()
      patch({ rootId, view: 'detail' })
    },

    back: () => {
      if (state.view === 'roots') return
      patch({ view: 'roots' })
    },
  }
}
