/** Smooth unless the person asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * Brings an element back to the top of the page only if it scrolled out above the fixed header.
 * Used after switching tabs/pages so the person never lands mid-content with the tab bar out of sight.
 */
export function revealIfAbove(el: Element | null | undefined, { smooth = true }: { smooth?: boolean } = {}): void {
  if (!el) return
  const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 56
  if (el.getBoundingClientRect().top >= headerHeight) return
  el.scrollIntoView({ block: 'start', behavior: smooth ? scrollBehavior() : 'auto' })
}
