import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'
import StorefrontSalesChannels from './StorefrontSalesChannels'

/**
 * As HOM-04's sibling `StorefrontFooter.spec.tsx` did, the suite asserts what
 * the visitor sees on a server render (`react-dom/server`) of the section:
 * the four channels, their key titles, the links with the correct hrefs and the
 * inline SVG icons. Projects and wholesale have no page, so they open WhatsApp
 * with a prefilled message.
 */

function renderSection(): string {
  return renderToStaticMarkup(createElement(StorefrontSalesChannels))
}

describe('canales de venta', () => {
  it('pinta los cuatro canales con su título y descripción', () => {
    const markup = renderSection()

    expect(markup).toContain('aria-labelledby="home-canales-title"')
    expect(markup).toContain('WhatsApp')
    expect(markup).toContain('Venta telefónica')
    expect(markup).toContain('Proyectos')
    expect(markup).toContain('Ventas al por mayor')
    expect(markup).toContain('Escríbenos por WhatsApp y te asesoramos en tu compra.')
    expect(markup).toContain('Llama a nuestra línea de ventas y haz tu pedido.')
    expect(markup).toContain('Cotiza proyectos de seguridad para tu empresa o edificio.')
    expect(markup).toContain('Precios especiales por volumen para distribuidores e instaladores.')
  })

  it('enlaza WhatsApp y la línea de ventas con los números de demo', () => {
    const markup = renderSection()

    expect(markup).toContain('href="https://wa.me/576011234567"')
    expect(markup).toContain('href="tel:+5761234567"')
  })

  it('deja WhatsApp como enlace externo con target y rel', () => {
    const markup = renderSection()

    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noreferrer noopener"')
  })

  it('abre WhatsApp con un mensaje prellenado en proyectos y ventas al por mayor', () => {
    const markup = renderSection()

    expect(markup).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.projects)}"`)
    expect(markup).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.wholesale)}"`)
    expect(markup).not.toContain('href="/proyectos"')
    expect(markup).not.toContain('href="/ventas-al-por-mayor"')
    // WhatsApp channel plus the two prefilled ones open a new tab.
    expect(markup.split('target="_blank"').length - 1).toBe(3)
  })

  it('pinta un ícono SVG por canal', () => {
    const markup = renderSection()

    expect(markup.split('<svg').length - 1).toBe(4)
    expect(markup.split('class="h-6 w-6"').length - 1).toBe(4)
  })
})
