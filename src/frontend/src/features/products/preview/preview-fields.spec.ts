import { describe, expect, it } from 'vitest'
import { PREVIEW_FIELD_ATTR, fieldFromElement, previewField, type ClosestLike } from './preview-fields'

interface FakeElement extends ClosestLike {
  readonly parent: FakeElement | null
  getAttribute(name: string): string | null
  closest(selector: string): FakeElement | null
}

/** Fake element with the one selector the module uses, so the spec needs no DOM. */
function element(attributes: Record<string, string> = {}, parent: FakeElement | null = null): FakeElement {
  const self: FakeElement = {
    parent,
    getAttribute: (name) => attributes[name] ?? null,
    closest(selector) {
      expect(selector).toBe('[data-preview-field]')
      for (let node: FakeElement | null = self; node; node = node.parent) {
        if (node.getAttribute(PREVIEW_FIELD_ATTR) !== null) return node
      }
      return null
    },
  }
  return self
}

describe('previewField', () => {
  it('returns the data attribute object for the field', () => {
    expect(previewField('name')).toEqual({ 'data-preview-field': 'name' })
    expect(previewField('internal')).toEqual({ 'data-preview-field': 'internal' })
  })
})

describe('fieldFromElement', () => {
  it('reads the field of a marked element', () => {
    expect(fieldFromElement(element({ 'data-preview-field': 'sku' }))).toBe('sku')
  })

  it('reads the field of the closest marked ancestor', () => {
    const outer = element({ 'data-preview-field': 'name' })
    const inner = element({ 'data-preview-field': 'brand' }, outer)
    const text = element({}, inner)
    expect(fieldFromElement(text)).toBe('brand')
  })

  it('reads the field through an unmarked ancestor', () => {
    const marked = element({ 'data-preview-field': 'price' })
    const unmarked = element({}, marked)
    expect(fieldFromElement(element({}, unmarked))).toBe('price')
  })

  it('returns null when the value is not a known field', () => {
    expect(fieldFromElement(element({ 'data-preview-field': 'unknown' }))).toBeNull()
    expect(fieldFromElement(element({ 'data-preview-field': '' }))).toBeNull()
  })

  it('does not fall back to an outer field when the closest value is unknown', () => {
    const outer = element({ 'data-preview-field': 'name' })
    const inner = element({ 'data-preview-field': 'nope' }, outer)
    expect(fieldFromElement(element({}, inner))).toBeNull()
  })

  it('returns null when no ancestor is marked', () => {
    expect(fieldFromElement(element({}, element({})))).toBeNull()
  })

  it('returns null for a missing element', () => {
    expect(fieldFromElement(null)).toBeNull()
    expect(fieldFromElement(undefined)).toBeNull()
  })

  it('round-trips the attribute produced by previewField', () => {
    expect(fieldFromElement(element(previewField('badges')))).toBe('badges')
  })
})
