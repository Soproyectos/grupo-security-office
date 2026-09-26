import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import StorefrontFooter from './StorefrontFooter'

/**
 * As HOM-03's sibling `storefront-home.spec.tsx` did, the suite asserts what
 * the visitor sees on a server render (`react-dom/server`) of the footer: the
 * link columns, the key links, the copyright with the year, the demo marking
 * and the social icons. The internal links are intended routes that do not
 * exist yet, so they render as plain anchors with the planned destination.
 */

function renderFooter(): string {
  return renderToStaticMarkup(createElement(StorefrontFooter))
}

describe('columnas del footer', () => {
  it('pinta las cuatro columnas con su título', () => {
    const markup = renderFooter()

    expect(markup).toContain('aria-labelledby="footer-Servicio al cliente-title"')
    expect(markup).toContain('aria-labelledby="footer-Compañía-title"')
    expect(markup).toContain('aria-labelledby="footer-Legal-title"')
    expect(markup).toContain('aria-labelledby="footer-contacto-title"')
    expect(markup).toContain('Servicio al cliente')
    expect(markup).toContain('Compañía')
    expect(markup).toContain('Legal')
    expect(markup).toContain('Contacto')
  })
})

describe('enlaces clave', () => {
  it('enlaza servicio al cliente a los destinos previstos', () => {
    const markup = renderFooter()

    expect(markup).toContain('Preguntas frecuentes')
    expect(markup).toContain('href="/preguntas-frecuentes"')
    expect(markup).toContain('Rastrea tu pedido')
    expect(markup).toContain('href="/rastrea-tu-pedido"')
    expect(markup).toContain('Cambios y devoluciones')
    expect(markup).toContain('href="/cambios-y-devoluciones"')
    expect(markup).toContain('Centro de ayuda')
    expect(markup).toContain('href="/centro-de-ayuda"')
  })

  it('enlaza compañía y mapa del sitio a los destinos previstos', () => {
    const markup = renderFooter()

    expect(markup).toContain('Sobre nosotros')
    expect(markup).toContain('href="/sobre-nosotros"')
    expect(markup).toContain('Vende con nosotros')
    expect(markup).toContain('href="/vende-con-nosotros"')
    expect(markup).toContain('Trabaja con nosotros')
    expect(markup).toContain('href="/trabaja-con-nosotros"')
    expect(markup).toContain('Mapa del sitio')
    expect(markup).toContain('href="/mapa-del-sitio"')
  })

  it('enlaza el legal y deja el estatuto del consumidor como externo', () => {
    const markup = renderFooter()

    expect(markup).toContain('Términos y condiciones')
    expect(markup).toContain('href="/terminos-y-condiciones"')
    expect(markup).toContain('Política de protección de datos')
    expect(markup).toContain('href="/politica-proteccion-datos"')
    expect(markup).toContain('Estatuto del consumidor')
    expect(markup).toContain('href="https://www.sic.gov.co/"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noreferrer noopener"')
  })
})

describe('contacto demo', () => {
  it('muestra los teléfonos y el email de demo', () => {
    const markup = renderFooter()

    expect(markup).toContain('(6) 123 4567')
    expect(markup).toContain('(601) 123 4567')
    expect(markup).toContain('serviciocliente@gruposecurity.example')
    expect(markup).toContain('Horario de atención')
  })
})

describe('fila inferior', () => {
  it('muestra el copyright con el año actual y el NIT marcado demo', () => {
    const markup = renderFooter()

    expect(markup).toContain(`© ${new Date().getFullYear()} Grupo Security S.A.S.`)
    expect(markup).toContain('NIT 900.000.000-0 (demo)')
  })

  it('pinta los cinco íconos de redes sociales', () => {
    const markup = renderFooter()

    expect(markup).toContain('aria-label="Facebook"')
    expect(markup).toContain('aria-label="Instagram"')
    expect(markup).toContain('aria-label="X"')
    expect(markup).toContain('aria-label="YouTube"')
    expect(markup).toContain('aria-label="WhatsApp"')
  })
})
