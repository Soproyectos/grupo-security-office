import { describe, expect, it } from 'vitest'
import { publishedImagesNotice } from './published-images'

describe('publishedImagesNotice (CAT-04 frontend-imagenes)', () => {
  it('sin revisión publicada (null): no hay nada anterior que conservar', () => {
    expect(publishedImagesNotice(['/api/files/a'], null)).toEqual({ state: 'sin_publicar', message: null, added: 0, removed: 0 })
  })

  it('borrador igual a lo publicado: sin aviso', () => {
    const n = publishedImagesNotice(['/api/files/a', '/api/files/b'], [{ src: '/api/files/a', alt: 'A' }, { src: '/api/files/b', alt: 'B' }])
    expect(n.state).toBe('igual')
    expect(n.message).toBeNull()
  })

  it('imagen nueva subida: se cuenta como aún no visible (la publicada sigue mandando)', () => {
    const n = publishedImagesNotice(['/api/files/a', '/api/files/nueva'], [{ src: '/api/files/a', alt: 'A' }])
    expect(n.state).toBe('difiere')
    expect(n.added).toBe(1)
    expect(n.removed).toBe(0)
    expect(n.message).toContain('1 aún no visible')
    expect(n.message).toContain('La tienda conserva la imagen publicada anterior')
  })

  it('imagen borrada del borrador: sigue publicándose hasta la próxima publicación', () => {
    const n = publishedImagesNotice([], [{ src: '/api/files/vieja', alt: 'V' }])
    expect(n.state).toBe('difiere')
    expect(n.removed).toBe(1)
    expect(n.message).toContain('1 sigue publicándose')
  })

  it('ambas cosas a la vez, con texto en español correcto', () => {
    const n = publishedImagesNotice(['/api/files/n1', '/api/files/n2'], [{ src: '/api/files/v1', alt: 'V' }, { src: '/api/files/v2', alt: 'V' }, { src: '/api/files/v3', alt: 'V' }])
    expect(n).toMatchObject({ state: 'difiere', added: 2, removed: 3 })
    expect(n.message).toContain('2 aún no visibles')
    expect(n.message).toContain('3 siguen publicándose')
  })

  it('ignora URLs vacíos y espacios (no cuenta basura como diferencia)', () => {
    const n = publishedImagesNotice(['  ', ''], [{ src: '  ', alt: 'x' }])
    expect(n.state).toBe('igual')
  })
})
