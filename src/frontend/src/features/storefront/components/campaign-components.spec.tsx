import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import HeroBanner from './HeroBanner'
import { PopupDialog } from './CampaignPopup'
import type { HeroCampaign, PopupCampaign } from '../utils/campaigns'

const hero = (id: string, extra: Partial<HeroCampaign> = {}): HeroCampaign => ({
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

function render(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

const banner = (campaigns: HeroCampaign[]) => render(createElement(HeroBanner, { campaigns }))

describe('banner del héroe', () => {
  it('sin campañas muestra la foto de respaldo de la cámara', () => {
    const markup = banner([])

    expect(markup).toContain('/images/home/storefront-art.png')
    expect(markup).not.toContain('aria-roledescription')
  })

  it('con una pieza no ofrece flechas, puntos ni pausa', () => {
    const markup = banner([hero('a')])

    expect(markup).toContain('aria-roledescription="carrusel"')
    expect(markup).toContain('aria-roledescription="diapositiva"')
    expect(markup).toContain('aria-label="1 de 1"')
    expect(markup).not.toContain('<button')
  })

  it('en celular el marco sigue la pieza móvil 4:3 cuando todas la tienen; si no, el marco apaisado', () => {
    const withMobile = banner([hero('a', { imageMobileUrl: '/m/a.png' }), hero('b', { imageMobileUrl: '/m/b.png' })])
    expect(withMobile).toContain('aspect-[4/3]')
    expect(withMobile).toContain('max-h-[22rem]')
    expect(withMobile).not.toContain('aspect-[2.37] ')
    const mixed = banner([hero('a', { imageMobileUrl: '/m/a.png' }), hero('b')])
    expect(mixed).toContain('aspect-[2.37]')
    expect(mixed).not.toContain('aspect-[4/3]')
    expect(banner([hero('a')])).toContain('aspect-[2.37]')
    expect(withMobile).toContain('media="(max-width: 767px)"')
  })

  it('con varias piezas pinta las diapositivas y sus controles', () => {
    const markup = banner([hero('a'), hero('b'), hero('c')])

    expect(markup.split('aria-roledescription="diapositiva"').length - 1).toBe(3)
    expect(markup).toContain('aria-label="3 de 3"')
    expect(markup).toContain('aria-label="Banner anterior"')
    expect(markup).toContain('aria-label="Banner siguiente"')
    expect(markup).not.toContain('Pausar el cambio automático')
    expect(markup).not.toContain('Ir a la diapositiva')
    expect(markup).toContain('alt="Banner b"')
  })

  it('solo hay dos flechas laterales, centradas, de 44 px y sin barra debajo de la imagen', () => {
    const markup = banner([hero('a'), hero('b')])
    expect(markup.split('<button').length - 1).toBe(2)
    expect(markup.split('top-1/2').length - 1).toBe(2)
    expect(markup.split('h-11 w-11').length - 1).toBe(2)
    expect(markup).toContain('left-0')
    expect(markup).toContain('right-0')
    expect(markup.split('<svg').length - 1).toBe(2)
    expect(markup).toContain('drop-shadow')
    expect(markup).not.toContain('bg-white/25')
    expect(markup).not.toContain('backdrop-blur')
    expect(markup).not.toContain('rounded-full')
    expect(markup).toContain('md:opacity-60')
    expect(markup).toContain('group-focus-visible/arrow:ring-2')
    expect(markup).not.toContain('pr-[5.5rem]')
    expect(markup).not.toContain('border-t')
  })

  it('la primera imagen carga con prioridad y las demás en diferido', () => {
    const markup = banner([hero('a'), hero('b')])

    expect(markup.split('fetchpriority="high"').length - 1).toBe(1)
    expect(markup.split('loading="lazy"').length - 1).toBe(1)
  })

  it('enlaza por dentro con el router y por fuera en pestaña nueva', () => {
    const internal = banner([hero('a', { linkUrl: '/catalogo/categoria/camaras' })])
    const external = banner([hero('a', { linkUrl: 'https://example.com/promo' })])

    expect(internal).toContain('href="/catalogo/categoria/camaras"')
    expect(internal).not.toContain('target=')
    expect(external).toContain('href="https://example.com/promo"')
    expect(external).toContain('target="_blank"')
    expect(external).toContain('rel="noreferrer noopener"')
  })

  it('usa la imagen móvil por debajo de 768 px cuando existe', () => {
    const withMobile = banner([hero('a', { imageMobileUrl: '/api/storefront/campaigns/a/image/mobile?v=1' })])
    const without = banner([hero('a')])

    expect(withMobile).toContain('<source media="(max-width: 767px)"')
    expect(withMobile).toContain('image/mobile?v=1')
    expect(without).not.toContain('<source')
  })

  it('aplica el ajuste y el foco de la campaña', () => {
    const markup = banner([hero('a', { fit: 'contain', focusX: 20, focusY: 80 })])

    expect(markup).toContain('--fit-d:contain')
    expect(markup).toContain('--pos-d:20% 80%')
    // Without a mobile image the phone shows the desktop one, so it gets the desktop framing.
    expect(markup).toContain('--fit-m:contain')
    expect(markup).toContain('--pos-m:20% 80%')
  })

  it('con imagen móvil aplica el encuadre móvil por debajo de 768 px y el de escritorio desde md', () => {
    const markup = banner([hero('a', {
      fit: 'cover', focusX: 20, focusY: 80, fitMobile: 'contain', focusMobileX: 70, focusMobileY: 10, imageMobileUrl: '/m/a.png',
    })])

    expect(markup).toContain('--fit-d:cover')
    expect(markup).toContain('--pos-d:20% 80%')
    expect(markup).toContain('--fit-m:contain')
    expect(markup).toContain('--pos-m:70% 10%')
    expect(markup).toContain('[object-fit:var(--fit-m)]')
    expect(markup).toContain('md:[object-position:var(--pos-d)]')
  })

  it('campaña sin campos móviles con imagen móvil hereda los valores de escritorio', () => {
    const markup = banner([hero('a', { fit: 'contain', focusX: 30, focusY: 40, imageMobileUrl: '/m/a.png' })])

    expect(markup).toContain('--fit-m:contain')
    expect(markup).toContain('--pos-m:30% 40%')
  })
})

describe('pop-up de la portada', () => {
  const popup: PopupCampaign = { id: 'p', revision: 3, alt: 'Oferta de temporada', linkUrl: null, imageUrl: '/api/storefront/campaigns/p/image/popup?v=3' }
  const dialog = (extra: Partial<PopupCampaign> = {}) =>
    render(createElement(PopupDialog, { popup: { ...popup, ...extra }, onClose: () => undefined }))

  it('es un diálogo modal con nombre accesible y solo la imagen', () => {
    const markup = dialog()

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-label="Oferta de temporada"')
    expect(markup).toContain('image/popup?v=3')
    expect(markup).not.toMatch(/<h[1-6]/)
    expect(markup).not.toContain('<p')
  })

  it('tiene un botón Cerrar y la imagen es enlace solo si la campaña lo trae', () => {
    expect(dialog()).toContain('aria-label="Cerrar"')
    expect(dialog()).not.toContain('<a ')
    expect(dialog({ linkUrl: '/soluciones' })).toContain('href="/soluciones"')
  })
})
