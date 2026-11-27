import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import ProductImageStage, {
  PRODUCT_STAGE_BG,
  PRODUCT_STAGE_BLEND,
} from './ProductImageStage'

describe('escenario de la foto de producto', () => {
  it('pinta la foto fuera del flujo, con el fondo gris con foco de luz y multiply', () => {
    const markup = renderToStaticMarkup(createElement(ProductImageStage, { src: '/api/files/1' }))

    expect(markup).toContain(PRODUCT_STAGE_BG)
    expect(markup).toContain(PRODUCT_STAGE_BLEND)
    expect(markup).toContain('absolute inset-0')
    expect(markup).toContain('object-contain')
    expect(markup).toContain('aspect-[4/3]')
  })

  it('sin imagen muestra el contenido alterno dentro del mismo marco', () => {
    const markup = renderToStaticMarkup(createElement(ProductImageStage, { src: null, fallback: createElement('b', null, 'Sin foto') }))

    expect(markup).toContain('Sin foto')
    expect(markup).not.toContain('<img')
    expect(markup).toContain(PRODUCT_STAGE_BG)
  })

  it('respeta el tamaño pedido y la carga inmediata', () => {
    const markup = renderToStaticMarkup(createElement(ProductImageStage, { src: '/x.jpg', sizeClass: 'h-16 w-16', eager: true }))

    expect(markup).toContain('h-16 w-16')
    expect(markup).toContain('loading="eager"')
  })
})
