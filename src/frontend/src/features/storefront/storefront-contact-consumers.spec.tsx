import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { StorefrontContact } from '../../services/storefront-contact.service'
import type { PublicProductDetail } from './types/publicProduct'
import { WHATSAPP_MESSAGES, whatsappUrl } from './constants/contact'
import StorefrontChrome from './components/StorefrontChrome'
import StorefrontFooter from './components/StorefrontFooter'
import StorefrontSalesChannels from './components/StorefrontSalesChannels'
import StorefrontProductPage from './pages/StorefrontProductPage'
import { loadStorefrontContact, retryStorefrontContact } from './hooks/useStorefrontContact'

/**
 * Los cuatro consumidores del contacto de la tienda con el dato del API en el
 * store: barra superior, pie, canales de venta y ficha de producto. El repo no
 * tiene entorno DOM, así que todo se afirma sobre el render de servidor, y el
 * servicio público se mockea para sembrar el store (cada caso lo siembra al
 * empezar, así el orden de los tests no importa).
 *
 * Cubre: los datos guardados reemplazan a los demo; con el API caído siguen
 * apareciendo las constantes; y que cada `href` de teléfono/WhatsApp se deriva
 * del E.164 guardado (`tel:+57…`, `https://wa.me/57…`).
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('../../services/public-storefront-contact.service', () => ({
  fetchPublicStorefrontContact: fetchMock,
}))

const { detailMock } = vi.hoisted(() => ({
  detailMock: {
    status: 'ready',
    product: null as PublicProductDetail | null,
    retry: vi.fn(),
  },
}))

vi.mock('./hooks/usePublicProductDetail', () => ({
  usePublicProductDetail: () => detailMock,
}))

const CONTACTO_API: StorefrontContact = {
  nationalPhone: '573101234567',
  whatsappPhone: '573009998877',
  salesPhone: '5764443322',
  email: 'tienda@gruposecurity.example',
  businessHoursShort: 'domingos de 9:00 a. m. a 1:00 p. m.',
  businessHoursFull: 'domingos de 9:00 a. m. a 1:00 p. m. · festivos con cita previa',
  sellWithUsMessage: 'Hola, quiero vender mis productos en la tienda.',
}

const PRODUCTO: PublicProductDetail = {
  id: 'prod-1',
  sku: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  description: null,
  brand: null,
  category: null,
  breadcrumb: [],
  images: [],
  technicalSpecs: [],
  datasheets: [],
  price: null,
}

const COTIZACION = 'Hola, quiero cotizar el producto Cámara Domo 4K (SKU: DS-2CD2143).'

/**
 * Siembra el store con un intento nuevo: `retry()` siempre arranca la carga y
 * `load()` espera al intento vigente, así funciona igual con la caché vacía,
 * con un `ready` anterior o con un `error`.
 */
async function seed(data: StorefrontContact | null): Promise<void> {
  fetchMock.mockReset()
  if (data === null) fetchMock.mockRejectedValue(new Error('network down'))
  else fetchMock.mockResolvedValue(data)
  retryStorefrontContact()
  await loadStorefrontContact()
}

function renderChrome(): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(StorefrontChrome, null, 'contenido')),
  )
}

function renderFooter(): string {
  return renderToStaticMarkup(createElement(StorefrontFooter))
}

function renderChannels(): string {
  return renderToStaticMarkup(createElement(StorefrontSalesChannels))
}

function renderProduct(): string {
  detailMock.status = 'ready'
  detailMock.product = PRODUCTO

  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/catalogo/productos/prod-1'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/catalogo/productos/:id',
          element: createElement(StorefrontProductPage),
        }),
      ),
    ),
  )
}

describe('los datos guardados del API reemplazan a los demo', () => {
  it('la barra superior enlaza la línea de ventas, el horario breve y el WhatsApp guardados', async () => {
    await seed(CONTACTO_API)
    const markup = renderChrome()

    expect(markup).toContain('href="tel:+5764443322"')
    expect(markup).toContain('Línea de ventas: (6) 444 3322')
    expect(markup).toContain('Atención: domingos de 9:00 a. m. a 1:00 p. m.')
    // La píldora "Contáctenos" lleva el mensaje fijo del modelo (no editable).
    expect(markup).toContain(
      `href="https://wa.me/${CONTACTO_API.whatsappPhone}?text=${encodeURIComponent(WHATSAPP_MESSAGES.contact)}"`,
    )
    expect(markup).toContain(`href="https://wa.me/${CONTACTO_API.whatsappPhone}"`)
    expect(markup).not.toContain('(6) 123 4567')
    expect(markup).not.toContain('lun a sáb 7:00 a. m. a 7:00 p. m.')
  })

  it('el pie muestra los teléfonos, el correo y el horario completos guardados', async () => {
    await seed(CONTACTO_API)
    const markup = renderFooter()

    expect(markup).toContain('href="tel:+5764443322"')
    expect(markup).toContain('Línea de ventas: (6) 444 3322')
    expect(markup).toContain('href="tel:+573101234567"')
    expect(markup).toContain('Línea nacional: (310) 123 4567')
    expect(markup).toContain('href="mailto:tienda@gruposecurity.example"')
    expect(markup).toContain('>tienda@gruposecurity.example</a>')
    expect(markup).toContain(`Horario de atención: ${CONTACTO_API.businessHoursFull}`)
    // "Vende con nosotros" del pie: número y mensaje guardados.
    expect(markup).toContain(
      `href="https://wa.me/${CONTACTO_API.whatsappPhone}?text=${encodeURIComponent(CONTACTO_API.sellWithUsMessage)}"`,
    )
    expect(markup).not.toContain('(601) 123 4567')
    expect(markup).not.toContain('serviciocliente@gruposecurity.example')
  })

  it('los canales de venta enlazan el WhatsApp y la línea de ventas guardados', async () => {
    await seed(CONTACTO_API)
    const markup = renderChannels()

    expect(markup).toContain(`href="https://wa.me/${CONTACTO_API.whatsappPhone}"`)
    expect(markup).toContain('href="tel:+5764443322"')
    // Proyectos y por mayor no tienen página: mensaje constante + número guardado.
    expect(markup).toContain(
      `href="https://wa.me/${CONTACTO_API.whatsappPhone}?text=${encodeURIComponent(WHATSAPP_MESSAGES.projects)}"`,
    )
    expect(markup).toContain(
      `href="https://wa.me/${CONTACTO_API.whatsappPhone}?text=${encodeURIComponent(WHATSAPP_MESSAGES.wholesale)}"`,
    )
    expect(markup.split('target="_blank"').length - 1).toBe(3)
    expect(markup).not.toContain('href="tel:+5761234567"')
  })

  it('la ficha de producto cotiza por WhatsApp y llama al número guardado', async () => {
    await seed(CONTACTO_API)
    const markup = renderProduct()

    expect(markup).toContain('href="tel:+573101234567"')
    expect(markup).toContain('href="https://wa.me/573009998877') // resumen y barra móvil
    expect(markup).toContain(
      `href="https://wa.me/${CONTACTO_API.whatsappPhone}?text=${encodeURIComponent(COTIZACION)}"`,
    )
    // píldora "Contáctenos" + 2 cotizaciones + "Vende con nosotros" del pie.
    expect(markup.split(`https://wa.me/${CONTACTO_API.whatsappPhone}?text=`).length - 1).toBe(4)
    expect(markup).not.toContain('href="tel:+576011234567"')
  })
})

describe('con el API caído se mantienen las constantes demo', () => {
  it('ningún consumidor queda en blanco', async () => {
    await seed(null)

    const chrome = renderChrome()
    expect(chrome).toContain('href="tel:+5761234567"')
    expect(chrome).toContain('Línea de ventas: (6) 123 4567')
    expect(chrome).toContain('Atención: lun a sáb 7:00 a. m. a 7:00 p. m.')
    expect(chrome).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.contact)}"`)

    const footer = renderFooter()
    expect(footer).toContain('href="tel:+5761234567"')
    expect(footer).toContain('Línea nacional: (601) 123 4567')
    expect(footer).toContain('href="mailto:serviciocliente@gruposecurity.example"')
    expect(footer).toContain('Horario de atención: lunes a sábado de 7:00 a.m. a 7:00 p.m.')

    const channels = renderChannels()
    expect(channels).toContain('href="https://wa.me/576011234567"')
    expect(channels).toContain('href="tel:+5761234567"')

    const product = renderProduct()
    expect(product).toContain('href="tel:+576011234567"')
    expect(product).toContain(`href="https://wa.me/576011234567?text=${encodeURIComponent(COTIZACION)}"`)
  })
})

describe('sin línea de ventas guardada', () => {
  it('no se pinta la fila de la barra ni el canal de venta telefónica', async () => {
    await seed({ ...CONTACTO_API, salesPhone: null })

    const chrome = renderChrome()
    expect(chrome).not.toContain('Línea de ventas:')
    expect(chrome).toContain('Atención: domingos de 9:00 a. m. a 1:00 p. m.')

    const footer = renderFooter()
    expect(footer).not.toContain('Línea de ventas:')
    expect(footer).toContain('Línea nacional: (310) 123 4567')

    const channels = renderChannels()
    expect(channels).not.toContain('Venta telefónica')
    expect(channels).toContain('Escríbenos por WhatsApp y te asesoramos en tu compra.')
  })
})
