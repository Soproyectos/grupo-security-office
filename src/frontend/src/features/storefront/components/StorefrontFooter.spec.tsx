import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { whatsappUrl, WHATSAPP_MESSAGES } from '../constants/contact'
import StorefrontFooter from './StorefrontFooter'

/**
 * As HOM-03's sibling `storefront-home.spec.tsx` did, the suite asserts what
 * the visitor sees on a server render (`react-dom/server`) of the footer: the
 * link columns, the links that have a real destination, the copyright with the
 * year, the demo marking and the social row. Entries without a destination are
 * not rendered, so the footer never links to a route that does not exist.
 */

function renderFooter(): string {
  return renderToStaticMarkup(createElement(StorefrontFooter))
}

describe('columnas del footer', () => {
  it('pinta solo las columnas que tienen enlaces reales, más contacto', () => {
    const markup = renderFooter()

    expect(markup).toContain('aria-labelledby="footer-Compañía-title"')
    expect(markup).toContain('aria-labelledby="footer-Legal-title"')
    expect(markup).toContain('aria-labelledby="footer-contacto-title"')
    expect(markup).toContain('Contacto')
    expect(markup).toContain('Servicio al cliente')
    expect(markup).not.toContain('Preguntas frecuentes')
  })
})

describe('enlaces', () => {
  it('no enlaza a rutas que no existen', () => {
    const markup = renderFooter()

    for (const label of [
      'Preguntas frecuentes',
      'Rastrea tu pedido',
      'Centro de ayuda',
      'Trabaja con nosotros',
      'Mapa del sitio',
      'Términos y condiciones',
      'Política de protección de datos',
    ]) {
      expect(markup).not.toContain(label)
    }
    for (const route of [
      '/preguntas-frecuentes',
      '/rastrea-tu-pedido',
      '/cambios-y-devoluciones',
      '/centro-de-ayuda',
      '/sobre-nosotros',
      '/vende-con-nosotros',
      '/trabaja-con-nosotros',
      '/mapa-del-sitio',
      '/terminos-y-condiciones',
      '/politica-proteccion-datos',
    ]) {
      expect(markup).not.toContain(`href="${route}"`)
    }
    expect(markup).not.toContain('href="#"')
  })

  it('enlaza Nosotros, Sedes y Garantías a sus rutas internas', () => {
    const markup = renderFooter()

    for (const [label, route] of [
      ['Sobre nosotros', '/nosotros'],
      ['Sedes', '/sedes'],
      ['Cambios y devoluciones', '/garantias'],
    ]) {
      expect(markup).toContain(`href="${route}"`)
      expect(markup).toContain(label)
    }
  })

  it('convierte "Vende con nosotros" en un enlace de WhatsApp con mensaje', () => {
    const markup = renderFooter()

    expect(markup).toContain('Vende con nosotros')
    expect(markup).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.sellWithUs)}"`)
  })

  it('deja el estatuto del consumidor como enlace externo', () => {
    const markup = renderFooter()

    expect(markup).toContain('Estatuto del consumidor')
    expect(markup).toContain('href="https://www.sic.gov.co/"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noreferrer noopener"')
  })
})

describe('contacto', () => {
  it('ofrece solo WhatsApp, con el único número publicado', () => {
    const markup = renderFooter()

    expect(markup).toContain('316 027 5100')
    expect(markup).toContain('href="https://wa.me/573160275100?text=')
    expect(markup).not.toContain('tel:')
    expect(markup).not.toContain('mailto:')
    expect(markup).not.toContain('Horario de atención')
  })
})

describe('fila inferior', () => {
  it('muestra el copyright con el año actual y sin NIT inventado', () => {
    const markup = renderFooter()

    expect(markup).toContain(`© ${new Date().getFullYear()} Grupo Security S.A.S.`)
    expect(markup).not.toContain('NIT')
  })

  it('oculta las redes sociales sin URL real y conserva WhatsApp', () => {
    const markup = renderFooter()

    expect(markup).not.toContain('aria-label="Facebook"')
    expect(markup).not.toContain('aria-label="Instagram"')
    expect(markup).not.toContain('aria-label="X"')
    expect(markup).not.toContain('aria-label="YouTube"')
    expect(markup).toContain('aria-label="WhatsApp"')
    expect(markup).toContain(`href="${whatsappUrl()}"`)
  })
})
