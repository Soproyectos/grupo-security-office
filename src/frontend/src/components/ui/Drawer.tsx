import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { nextFocusIndex } from './drawer-focus'
import { useWideScreen } from './useWideScreen'

interface DrawerProps {
  open: boolean
  /** Called on Escape, backdrop click and the close button. The parent decides whether to really close. */
  onClose: () => void
  title: string
  children: ReactNode
  /**
   * Optional content shown outside the panel: from 1024 px up it fills the space left of the panel, over the dimmed page (clicks on the dimmed area around it still close the drawer); below that
   * it sits at the top of the panel. Focus, Escape and Tab stay handled by the drawer.
   */
  aside?: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Side panel that slides in from the right (full screen on phones). It is a modal
 * dialog: it locks the page scroll, traps focus, closes with Escape or a click on
 * the backdrop, and gives focus back to the element that opened it.
 */
export default function Drawer({ open, onClose, title, children, aside }: DrawerProps) {
  const wide = useWideScreen()
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCloseRef.current()
      return
    }
    if (event.key !== 'Tab') return
    const panel = panelRef.current
    const root = rootRef.current
    if (!panel || !root) return
    // The aside (outside the panel) is part of the same focus cycle.
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }
    const active = document.activeElement as HTMLElement | null
    const index = active ? items.indexOf(active) : -1
    const leaving = event.shiftKey ? index <= 0 : index === -1 || index === items.length - 1
    if (leaving) {
      event.preventDefault()
      items[nextFocusIndex(items.length, event.shiftKey ? 0 : index, event.shiftKey)]?.focus()
    }
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex justify-end" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/50" data-testid="drawer-backdrop" aria-hidden="true" onClick={() => onCloseRef.current()} />
      {aside && wide && (
        <div className="drawer-aside pointer-events-none p-6" data-testid="drawer-aside">
          <div className="pointer-events-auto h-full w-full">{aside}</div>
        </div>
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="drawer-panel relative flex h-full w-full flex-col bg-white shadow-xl focus:outline-none md:w-[560px] md:max-w-full"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 md:px-6">
          <h2 id={titleId} className="text-lg font-condensed font-semibold text-neutral-800">{title}</h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            aria-label="Cerrar panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-6">
          {aside && !wide && <div className="mb-5" data-testid="drawer-aside">{aside}</div>}
          {children}
        </div>
      </div>
    </div>
  )
}
