import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { BUSINESS_HOURS_SHORT, WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'
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

  it('pinta la barra con el rojo institucional y texto blanco de la marca', () => {
    const markup = renderChrome()

    expect(markup).toContain('bg-[#CE0203]')
    expect(markup).toContain('text-xs text-white')
  })

  it('ofrece contacto directo: teléfono, horario y WhatsApp a un asesor', () => {
    const markup = renderChrome()

    expect(markup).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.contact)}"`)
    expect(markup).toContain('aria-label="Contáctenos por WhatsApp"')
    expect(markup).toContain('>Contáctenos</a>')
  })

  it('publica el horario para que el visitante sepa cuándo esperar respuesta', () => {
    expect(renderChrome()).toContain(`Atención: ${BUSINESS_HOURS_SHORT}`)
  })

  it('no afirma marcas ni promociones que no se pueden verificar', () => {
    const markup = renderChrome()

    expect(markup).not.toContain('marcas líderes')
    expect(markup).not.toContain('Distribuidor autorizado')
  })
})

describe('botón flotante de WhatsApp', () => {
  it('usa el número de las constantes', () => {
    expect(renderChrome()).toContain(`href="${whatsappUrl()}"`)
  })
})
