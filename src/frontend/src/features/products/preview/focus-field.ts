import { PREVIEW_FIELD_ATTR } from './preview-fields'
import type { PreviewField } from './preview-model'

/** Controls a person can type into, pick or press inside a field zone. */
const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/*
 * Structural shapes: real DOM elements satisfy them and specs can pass plain objects.
 * `focus` and `scrollIntoView` are optional because not every element has them (for example Element).
 */
export interface CenterScrollOptions {
  block: 'center'
  behavior: ScrollBehavior
}

export interface FocusTarget {
  focus?(options?: { preventScroll?: boolean }): void
  scrollIntoView?(options?: CenterScrollOptions): void
}

export interface FocusZone extends FocusTarget {
  matches?(selector: string): boolean
  querySelector(selector: string): FocusTarget | null
  /** Ancestor lookup, used to open a closed <details> around the zone. Fakes may omit it. */
  closest?(selector: string): unknown
}

export interface FocusRoot {
  querySelector(selector: string): FocusZone | null
}

/** Window-like object with the media query API; fakes may return null. */
export interface MotionWindow {
  matchMedia?(query: string): { matches: boolean } | null
}

/** 'auto' when the person asked for less motion, otherwise 'smooth'. */
export function scrollBehavior(win: MotionWindow | null | undefined): ScrollBehavior {
  return win?.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true ? 'auto' : 'smooth'
}

function browserWindow(): MotionWindow | null {
  return typeof window === 'undefined' ? null : window
}

/** A closed <details> hides its controls from focus, so the zone's <details> is opened first. */
function openClosedDetails(zone: FocusZone): void {
  const details: unknown = zone.closest?.('details')
  if (typeof details === 'object' && details !== null && 'open' in details && details.open === false) {
    details.open = true
  }
}

/**
 * Moves the editor to a field: focuses the first control inside its zone, or scrolls the zone into view if it has none.
 * A closed <details> around the zone is opened first. Returns whether the zone was found.
 */
export function focusFieldZone(root: FocusRoot | null | undefined, field: PreviewField): boolean {
  const zone = root?.querySelector(`[${PREVIEW_FIELD_ATTR}="${field}"]`)
  if (!zone) return false

  openClosedDetails(zone)
  const control = zone.matches?.(FOCUSABLE) ? zone : zone.querySelector(FOCUSABLE)
  control?.focus?.({ preventScroll: true })
  const target = control ?? zone
  target.scrollIntoView?.({ block: 'center', behavior: scrollBehavior(browserWindow()) })
  return true
}
