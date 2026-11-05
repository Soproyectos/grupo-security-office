import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'
import StorefrontChrome from './StorefrontChrome'

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

function renderChrome(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(StorefrontChrome, null, 'contenido')))
}

describe('cabecera común', () => {
  it('ya no pinta la barra roja superior en las interiores', () => {
    const markup = renderChrome()

    // "Línea de ventas" still lives in the footer, so the bar is detected by its
    // own markers: the hours label, the pill and the red background.
    expect(markup).not.toContain('Atención:')
    expect(markup).not.toContain('Contáctenos')
    expect(markup).not.toContain('bg-[#CE0203]')
  })

  it('no muestra textos que parecen enlaces pero no llevan a ninguna parte', () => {
    const markup = renderChrome()

    expect(markup).not.toContain('<span>Rastrea tu pedido</span>')
    expect(markup).not.toContain('<span>Centro de ayuda</span>')
  })

  it('convierte "Vende con nosotros" en WhatsApp con mensaje', () => {
    expect(renderChrome()).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.sellWithUs)}"`)
  })

  it('ya no ofrece el botón rojo "Categorías" aparte', () => {
    expect(renderChrome()).not.toContain('>Categorías<')
  })
})

describe('plantilla común', () => {
  const renderHome = () =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(StorefrontChrome, { home: true, children: 'contenido' })))

  it('usa el mismo menú "Mi cuenta" en la portada y en las interiores', () => {
    for (const markup of [renderChrome(), renderHome()]) {
      expect(markup).toMatch(/<button[^>]*aria-haspopup="true"[^>]*>.*Mi cuenta<\/button>/)
      expect(markup).toContain('href="/clientes/registro"')
    }
  })

  it('deja el buscador solo en las interiores y sin barra roja en ninguna', () => {
    expect(renderChrome()).toContain('name="q"')
    expect(renderHome()).not.toContain('name="q"')
    for (const markup of [renderChrome(), renderHome()]) {
      expect(markup).not.toContain('Atención:')
      expect(markup).not.toContain('Contáctenos')
    }
  })

  it('pinta la navegación Tienda con Catálogo, Soluciones y Soporte en ambos modos', () => {
    for (const markup of [renderChrome(), renderHome()]) {
      expect(occurrences(markup, 'aria-label="Tienda"')).toBe(1)
      expect(markup).toMatch(/<nav aria-label="Tienda"[^>]*>.*Catálogo.*Soluciones.*Soporte.*<\/nav>/)
    }
  })

  it('"Catálogo" es el botón del menú de categorías con su región asociada', () => {
    for (const markup of [renderChrome(), renderHome()]) {
      expect(markup).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="category-mega-menu"[^>]*>.*Catálogo/)
      expect(markup).not.toContain('id="category-mega-menu"')
    }
  })

  it('enlaza Soluciones y Soporte a sus páginas, desde cualquier página', () => {
    for (const markup of [renderChrome(), renderHome()]) {
      expect(markup).toContain('href="/soluciones"')
      expect(markup).not.toContain('href="/tienda#soluciones"')
      expect(markup).toContain('href="/servicios/soporte"')
      expect(markup).not.toContain('href="#soluciones"')
      expect(markup).not.toContain('href="#contacto-tienda"')
    }
  })

  it('no agrega un <main> propio: lo pone cada página', () => {
    for (const markup of [renderChrome(), renderHome()]) {
      expect(markup).not.toContain('<main')
    }
  })

  it('pinta el mismo pie claro en ambas, sin envoltorio que lo restilice', () => {
    for (const markup of [renderChrome(), renderHome()]) {
      expect(markup).toContain('<footer class="bg-storefront-ink')
      expect(markup).not.toContain('[&_footer]')
    }
  })
})

describe('botón flotante de WhatsApp', () => {
  it('usa el número de las constantes', () => {
    expect(renderChrome()).toContain(`href="${whatsappUrl()}"`)
  })
})
