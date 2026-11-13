import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImageViewer } from './ImageViewer'
import { revealIfAbove, scrollBehavior } from '../../lib/scroll'

const images = [
  { id: 'a', src: '/img/a.png', alt: 'Frente' },
  { id: 'b', src: '/img/b.png', alt: 'Lateral' },
]

const render = (props: Partial<Parameters<typeof ImageViewer>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ImageViewer, { images, index: 0, open: false, onIndexChange: vi.fn(), onClose: vi.fn(), ...props }),
  )

describe('ImageViewer', () => {
  it('shows the selected image, the counter and both arrows when there are several images', () => {
    const html = render({ index: 1 })
    expect(html).toContain('src="/img/b.png"')
    expect(html).toContain('alt="Lateral"')
    expect(html).toContain('2 de 2')
    expect(html).toContain('Imagen anterior')
    expect(html).toContain('Imagen siguiente')
  })

  it('hides arrows, counter and thumbnails with a single image but keeps the close button', () => {
    const html = render({ images: [images[0]!] })
    expect(html).toContain('Cerrar vista ampliada')
    expect(html).not.toContain('Imagen anterior')
    expect(html).not.toContain('de 1')
  })

  it('renders nothing when there are no images', () => {
    expect(render({ images: [] })).toBe('')
  })
})

describe('scroll helpers', () => {
  it('fall back safely when matchMedia / scrollIntoView are missing (old browsers)', () => {
    vi.stubGlobal('window', {})
    try {
      expect(scrollBehavior()).toBe('smooth')
      expect(() => revealIfAbove({ getBoundingClientRect: () => ({ top: -10 }) } as unknown as Element)).not.toThrow()
      expect(() => revealIfAbove(null)).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses instant scrolling when the person asked for reduced motion', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    try {
      expect(scrollBehavior()).toBe('auto')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
