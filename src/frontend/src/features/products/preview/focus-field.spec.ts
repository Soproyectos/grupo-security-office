import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusFieldZone, scrollBehavior, type FocusRoot, type FocusZone } from './focus-field'

const target = () => ({ focus: vi.fn(), scrollIntoView: vi.fn() })

/** A root whose `querySelector` returns `zone` (or nothing when it is null). */
const rootReturning = (zone: FocusZone | null) => ({ querySelector: vi.fn((): FocusZone | null => zone) }) satisfies FocusRoot

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('focusFieldZone', () => {
  it('focuses the first control inside the zone and returns true', () => {
    const input = target()
    const zone = { ...target(), matches: vi.fn(() => false), querySelector: vi.fn(() => input) }
    const root = rootReturning(zone)

    expect(focusFieldZone(root, 'name')).toBe(true)
    expect(root.querySelector).toHaveBeenCalledWith('[data-preview-field="name"]')
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(zone.focus).not.toHaveBeenCalled()
  })

  it('scrolls a zone without controls into view and returns true', () => {
    const zone = { ...target(), matches: vi.fn(() => false), querySelector: vi.fn(() => null) }

    expect(focusFieldZone(rootReturning(zone), 'images')).toBe(true)
    expect(zone.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(zone.focus).not.toHaveBeenCalled()
  })

  it('focuses the zone itself when it is the control', () => {
    const zone = { ...target(), matches: vi.fn(() => true), querySelector: vi.fn(() => null) }

    expect(focusFieldZone(rootReturning(zone), 'sku')).toBe(true)
    expect(zone.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(zone.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
  })

  it('returns false when the zone is not in the editor', () => {
    expect(focusFieldZone(rootReturning(null), 'price')).toBe(false)
  })

  it('returns false without a root', () => {
    expect(focusFieldZone(null, 'price')).toBe(false)
    expect(focusFieldZone(undefined, 'price')).toBe(false)
  })

  it('scrolls without animation when the person asks for reduced motion', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    const zone = { ...target(), matches: vi.fn(() => false), querySelector: vi.fn(() => null) }

    focusFieldZone(rootReturning(zone), 'resources')
    expect(zone.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
  })

  it('opens a closed <details> around the zone before focusing its control', () => {
    const details = { open: false }
    const input = target()
    const zone = { ...target(), matches: vi.fn(() => false), querySelector: vi.fn(() => input), closest: vi.fn(() => details) }

    expect(focusFieldZone(rootReturning(zone), 'specs')).toBe(true)
    expect(zone.closest).toHaveBeenCalledWith('details')
    expect(details.open).toBe(true)
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('leaves an already open <details> as it is', () => {
    const details = { open: true }
    const zone = { ...target(), matches: vi.fn(() => false), querySelector: vi.fn(() => null), closest: vi.fn(() => details) }

    expect(focusFieldZone(rootReturning(zone), 'specs')).toBe(true)
    expect(details.open).toBe(true)
  })

  it('does not touch anything when the zone has no <details> ancestor', () => {
    const zone = { ...target(), matches: vi.fn(() => false), querySelector: vi.fn(() => null), closest: vi.fn(() => null) }

    expect(focusFieldZone(rootReturning(zone), 'images')).toBe(true)
    expect(zone.closest).toHaveBeenCalledWith('details')
    expect(zone.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
  })
})

describe('scrollBehavior', () => {
  it('is smooth without a window or without the reduced motion preference', () => {
    expect(scrollBehavior(null)).toBe('smooth')
    expect(scrollBehavior({ matchMedia: () => null })).toBe('smooth')
    expect(scrollBehavior({ matchMedia: () => ({ matches: false }) })).toBe('smooth')
  })

  it('is auto with the reduced motion preference', () => {
    expect(scrollBehavior({ matchMedia: () => ({ matches: true }) })).toBe('auto')
  })
})

describe('focusFieldZone types', () => {
  it('accepts a real document as the root', () => {
    // Compile-time guard for the wiring: the editor passes its document. Never called at runtime here.
    const focusFromDocument = (doc: Document) => focusFieldZone(doc, 'name')
    expect(focusFromDocument).toBeTypeOf('function')
  })
})
