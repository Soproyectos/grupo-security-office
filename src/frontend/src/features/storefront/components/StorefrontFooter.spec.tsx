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
    // Every entry of "Servicio al cliente" lacks a destination: no empty column.
    expect(markup).not.toContain('Servicio al cliente')
  })
})

describe('enlaces', () => {
  it('no enlaza a rutas que no existen', () => {
    const markup = renderFooter()

    for (const label of [
      'Preguntas frecuentes',
      'Rastrea tu pedido',
      'Cambios y devoluciones',
      'Centro de ayuda',
      'Sobre nosotros',
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

describe('contacto demo', () => {
  it('muestra los teléfonos y el email de demo desde las constantes', () => {
    const markup = renderFooter()

    expect(markup).toContain('(6) 123 4567')
    expect(markup).toContain('(601) 123 4567')
    expect(markup).toContain('href="tel:+5761234567"')
    expect(markup).toContain('href="mailto:serviciocliente@gruposecurity.example"')
    expect(markup).toContain('Horario de atención')
  })
})

describe('fila inferior', () => {
  it('muestra el copyright con el año actual y el NIT marcado demo', () => {
    const markup = renderFooter()

    expect(markup).toContain(`© ${new Date().getFullYear()} Grupo Security S.A.S.`)
    expect(markup).toContain('NIT 900.000.000-0 (demo)')
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
