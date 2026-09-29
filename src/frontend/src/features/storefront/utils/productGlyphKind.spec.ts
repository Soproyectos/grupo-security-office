import { describe, expect, it } from 'vitest'
import { productGlyphKind } from './productGlyphKind'

describe('productGlyphKind', () => {
  it.each([
    ['camaras-turbo', 'camera'],
    ['dvrs-turbo', 'recorder'],
    ['motores-para-puertas-levadizas', 'gate'],
    ['energia-paneles-solares', 'solar'],
    ['bancos-de-baterias-para-ups', 'battery'],
    ['ups-on-line', 'power'],
    ['almacenamiento', 'storage'],
    ['cerraduras-inteligentes-smart', 'lock'],
    ['cableado-categoria-6', 'box'],
  ])('%s usa el icono %s', (slug, kind) => {
    expect(productGlyphKind(slug)).toBe(kind)
  })

  it('usa la caja cuando no hay categoría', () => {
    expect(productGlyphKind(null)).toBe('box')
    expect(productGlyphKind(undefined)).toBe('box')
  })
})
