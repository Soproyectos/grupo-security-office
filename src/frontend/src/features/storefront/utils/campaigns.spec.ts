import { describe, expect, it } from 'vitest'
import {
  linkKind,
  nextIndex,
  normalizeCampaigns,
  popupSessionKey,
  resolveCampaignImageUrl,
  shouldShowPopup,
  wasPopupSeen,
} from './campaigns'

const hero = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  revision: 1,
  alt: `Banner ${id}`,
  linkUrl: null,
  fit: 'cover',
  focusX: 50,
  focusY: 50,
  imageDesktopUrl: `/api/storefront/campaigns/${id}/image/desktop?v=1`,
  imageMobileUrl: null,
  ...extra,
})

describe('nextIndex', () => {
  it('avanza y retrocede dando la vuelta', () => {
    expect(nextIndex(0, 1, 3)).toBe(1)
    expect(nextIndex(2, 1, 3)).toBe(0)
    expect(nextIndex(0, -1, 3)).toBe(2)
  })

  it('con cero piezas devuelve 0', () => {
    expect(nextIndex(0, 1, 0)).toBe(0)
  })
})

describe('linkKind', () => {
  it('distingue interno, externo y no válido', () => {
    expect(linkKind('/catalogo')).toBe('internal')
    expect(linkKind('https://example.com/x')).toBe('external')
    expect(linkKind('//evil.example')).toBeNull()
    expect(linkKind('javascript:alert(1)')).toBeNull()
    expect(linkKind(null)).toBeNull()
  })
})

describe('resolveCampaignImageUrl', () => {
  it('deja intacta una URL absoluta y conserva la ruta relativa', () => {
    expect(resolveCampaignImageUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(resolveCampaignImageUrl('/api/storefront/campaigns/1/image/desktop?v=2')).toContain('/api/storefront/campaigns/1/image/desktop?v=2')
  })
})

describe('normalizeCampaigns', () => {
  it('lee la respuesta envuelta y limita el banner a 6 piezas', () => {
    const payload = { data: { hero: Array.from({ length: 8 }, (_, i) => hero(`h${i}`)), popup: null } }
    const out = normalizeCampaigns(payload)

    expect(out.hero).toHaveLength(6)
    expect(out.popup).toBeNull()
  })

  it('descarta piezas sin imagen y enlaces no seguros', () => {
    const out = normalizeCampaigns({ hero: [hero('a', { linkUrl: 'javascript:x' }), { id: 'b' }], popup: { id: 'p' } })

    expect(out.hero).toHaveLength(1)
    expect(out.hero[0]?.linkUrl).toBeNull()
    expect(out.popup).toBeNull()
  })

  it('lee el encuadre móvil y, si falta, hereda el de escritorio (retrocompatible)', () => {
    const old = normalizeCampaigns({ hero: [hero('a', { fit: 'contain', focusX: 20, focusY: 80 })], popup: null }).hero[0]
    expect(old).toMatchObject({ fitMobile: 'contain', focusMobileX: 20, focusMobileY: 80 })
    const own = normalizeCampaigns({ hero: [hero('a', { fitMobile: 'contain', focusMobileX: 70, focusMobileY: 120 })], popup: null }).hero[0]
    expect(own).toMatchObject({ fit: 'cover', focusX: 50, fitMobile: 'contain', focusMobileX: 70, focusMobileY: 100 })
    const bad = normalizeCampaigns({ hero: [hero('a', { focusX: 10, fitMobile: 'stretch', focusMobileX: 'x' })], popup: null }).hero[0]
    expect(bad).toMatchObject({ fitMobile: 'cover', focusMobileX: 10 })
  })

  it('una forma inesperada es «sin campañas»', () => {
    expect(normalizeCampaigns(null)).toEqual({ hero: [], popup: null })
    expect(normalizeCampaigns('x')).toEqual({ hero: [], popup: null })
  })
})

describe('pop-up por sesión', () => {
  const popup = { id: 'p1', revision: 2, alt: 'A', linkUrl: null, imageUrl: '/x' }
  const store = (seen: string[]) => ({ getItem: (key: string) => (seen.includes(key) ? '1' : null) })

  it('la clave incluye campaña y revisión', () => {
    expect(popupSessionKey(popup)).toBe('storefront:popup:p1:2')
  })

  it('se muestra si no se vio, y no si ya se vio esa revisión', () => {
    expect(shouldShowPopup(popup, store([]))).toBe(true)
    expect(shouldShowPopup(popup, store(['storefront:popup:p1:2']))).toBe(false)
    expect(shouldShowPopup(popup, store(['storefront:popup:p1:1']))).toBe(true)
  })

  it('sin campaña no se muestra y sin almacenamiento sí funciona', () => {
    expect(shouldShowPopup(null, store([]))).toBe(false)
    expect(shouldShowPopup(popup, null)).toBe(true)
    expect(wasPopupSeen(popup, { getItem: () => { throw new Error('blocked') } })).toBe(false)
  })
})
