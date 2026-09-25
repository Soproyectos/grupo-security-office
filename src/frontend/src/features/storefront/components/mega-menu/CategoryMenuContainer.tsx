import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useCategoryMenu } from '../../hooks/useCategoryMenu'
import { createMegaMenuStore } from './menu-controller'
import { findRoot, MENU_PANEL_ID, navigableRoots, resolveRootId } from './menu-model'
import MegaMenu from './MegaMenu'

/**
 * Header trigger + region of the categories mega menu. It owns the interaction
 * state through `createMegaMenuStore` (open/close, selected root, hover intent,
 * mobile drill-down) and wires the browser events to it: Escape and route
 * changes close the menu and the focus goes back to the trigger.
 */
export default function CategoryMenuContainer() {
  const { status, categories, retry } = useCategoryMenu()
  const [store] = useState(createMegaMenuStore)
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()

  const roots = useMemo(() => navigableRoots(categories), [categories])
  const selectedId = resolveRootId(roots, state.rootId)
  const selectedRoot = findRoot(roots, selectedId)

  useEffect(() => {
    store.setRoots(roots)
  }, [roots, store])

  const close = useCallback(() => store.close(true), [store])
  const closeSilently = useCallback(() => store.close(false), [store])

  /** Escape anywhere dismisses the menu, as the panel is not a focus trap. */
  useEffect(() => {
    if (!state.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      store.close(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state.open, store])

  /**
   * Navigating away (a link of the menu, the breadcrumb, the browser) closes
   * the panel. A ref remembers the last pathname so opening the menu does not
   * count as a navigation.
   */
  const lastPathname = useRef(pathname)
  useEffect(() => {
    if (lastPathname.current === pathname) return
    lastPathname.current = pathname
    closeSilently()
  }, [closeSilently, pathname])

  /**
   * On open the focus enters the menu (on the selected root, which only exists
   * once the tree has loaded) and on close it goes back to the trigger. The ref
   * keeps the focus from jumping again when the selection changes.
   */
  const rootFocused = useRef(false)
  useEffect(() => {
    if (!state.open) {
      rootFocused.current = false
      if (state.returnFocus) triggerRef.current?.focus()
      return
    }
    if (rootFocused.current || selectedId === null) return
    rootFocused.current = true
    focusRootButton(selectedId)
  }, [selectedId, state.open, state.returnFocus])

  const onSidebarKeyDown = useCallback(
    (key: string) => {
      const targetId = store.move(key)
      if (targetId !== null) focusRootButton(targetId)
    },
    [store],
  )

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={store.toggle}
        aria-expanded={state.open}
        aria-controls={MENU_PANEL_ID}
        className="flex items-center gap-2 rounded-[10px] border-2 border-[#CE0203] bg-[#CE0203] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#AD0102]"
      >
        <span className="flex flex-col gap-[3px]" aria-hidden="true">
          <span className="h-[2px] w-4 rounded bg-white" />
          <span className="h-[2px] w-4 rounded bg-white" />
          <span className="h-[2px] w-4 rounded bg-white" />
        </span>
        Categorías
      </button>
      {state.open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-neutral-900/40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            id={MENU_PANEL_ID}
            className="fixed inset-0 z-40 lg:absolute lg:inset-x-0 lg:top-full lg:bottom-auto lg:mt-2 lg:h-auto"
          >
            <MegaMenu
              status={status}
              roots={roots}
              selectedRoot={selectedRoot}
              selectedId={selectedId}
              view={state.view}
              onSelect={store.select}
              onHover={store.hover}
              onLeave={store.leave}
              onKeyDown={onSidebarKeyDown}
              onOpenDetail={store.openRootDetail}
              onBack={store.back}
              onClose={close}
              onRetry={retry}
            />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Both responsive variants are in the DOM, so the root button of a variant that
 * is not on screen is found too: only the visible one (`display: none` produces
 * no client rects) is focused.
 */
function focusRootButton(rootId: string): void {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-root-id="${rootId}"]`)
  for (const candidate of candidates) {
    if (candidate.getClientRects().length > 0) {
      candidate.focus()
      return
    }
  }
}
