import { describe, expect, it } from 'vitest'
import { PREVIEW_FRAME_CSS } from './preview-frame-css'

describe('PREVIEW_FRAME_CSS', () => {
  it('outlines the highlighted field with a solid brand line and a light tint', () => {
    expect(PREVIEW_FRAME_CSS).toMatch(/\[data-preview-highlight\][^{]*\{[^}]*outline: 3px solid/)
    expect(PREVIEW_FRAME_CSS).toContain('background-color: rgb(206 2 3 / 8%);')
  })

  it('shows a dashed outline when a field is hovered', () => {
    expect(PREVIEW_FRAME_CSS).toMatch(/\[data-preview-field\]:hover \{[^}]*outline: 2px dashed/)
  })

  it('removes the field transitions under reduced motion', () => {
    expect(PREVIEW_FRAME_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-preview-field\] \{\s*transition: none;/,
    )
  })

  it('uses the app brand red token with the brand value as fallback', () => {
    expect(PREVIEW_FRAME_CSS).toContain('var(--color-primary, #ce0203)')
  })
})
