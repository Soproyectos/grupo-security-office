import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'
import StorefrontChrome from './StorefrontChrome'

function renderChrome(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(StorefrontChrome, null, 'contenido')))
}

describe('barra superior', () => {
  it('lee la línea de ventas de las constantes y la enlaza', () => {
    const markup = renderChrome()

    expect(markup).toContain('href="tel:+5761234567"')
    expect(markup).toContain('Línea de ventas: (6) 123 4567')
  })

  it('no muestra textos que parecen enlaces pero no llevan a ninguna parte', () => {
    const markup = renderChrome()

    expect(markup).not.toContain('<span>Rastrea tu pedido</span>')
    expect(markup).not.toContain('<span>Centro de ayuda</span>')
  })

  it('convierte "Vende con nosotros" en WhatsApp con mensaje', () => {
    const markup = renderChrome()

    expect(markup).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.sellWithUs)}"`)
  })
})

describe('botón flotante de WhatsApp', () => {
  it('usa el número de las constantes', () => {
    expect(renderChrome()).toContain(`href="${whatsappUrl()}"`)
  })
})
