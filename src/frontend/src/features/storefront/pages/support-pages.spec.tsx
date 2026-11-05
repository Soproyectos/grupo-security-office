import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SupportPage from './SupportPage'
import ConfigureEquipmentPage from './ConfigureEquipmentPage'
import { configureSupportMessage, whatsappUrl } from '../constants/contact'

function render(page: typeof SupportPage, path: string): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(page)),
    ),
  )
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

function anchor(markup: string, href: string): string {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return markup.match(new RegExp(`<a\\s[^>]*href="${escaped}"[^>]*>`))?.[0] ?? ''
}

describe('configureSupportMessage', () => {
  it('arma el mensaje con la necesidad y los marcadores', () => {
    expect(configureSupportMessage('actualizar el firmware')).toBe(
      'Hola, compré una cámara en Grupo Security y necesito actualizar el firmware.\nReferencia: [escribe la referencia]\nFactura o pedido: [escribe el número]',
    )
  })
})

describe('página de soporte técnico', () => {
  const markup = render(SupportPage, '/servicios/soporte')

  it('tiene un solo <main> y un solo <h1>', () => {
    expect(occurrences(markup, '<main')).toBe(1)
    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain('Soporte técnico</h1>')
    expect(markup).toContain('Configurar un equipo nuevo no es lo mismo que repararlo.')
  })

  it('enlaza a configurar, sedes y garantías por rutas internas', () => {
    for (const route of ['/servicios/soporte/configurar', '/sedes', '/garantias']) {
      expect(anchor(markup, route)).not.toBe('')
      expect(anchor(markup, route)).not.toContain('target=')
    }
    expect(markup).not.toContain('gruposecurity.co')
    for (const label of ['Pedir ayuda para configurar', 'Ver las sedes', 'Ver garantías y devoluciones']) {
      expect(markup).toContain(label)
    }
  })

  it('incluye la banda de orientación con el enlace «configurar»', () => {
    expect(markup).toContain('¿No sabes cuál elegir?')
    expect(markup).toMatch(/empieza por\s*(<!-- -->)?\s*<a[^>]*href="\/servicios\/soporte\/configurar"[^>]*>configurar<\/a>/)
    expect(markup).toContain('bg-surface-100')
  })

  it('no conserva colores sueltos', () => {
    expect(markup).not.toContain('slate-')
    expect(markup).not.toContain('#CE0203')
  })
})

describe('página de configurar un equipo', () => {
  const markup = render(ConfigureEquipmentPage, '/servicios/soporte/configurar')

  it('tiene un solo <main> y un solo <h1>', () => {
    expect(occurrences(markup, '<main')).toBe(1)
    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain('Configurar un equipo</h1>')
  })

  it('muestra 4 radios con su label y el primero marcado', () => {
    const radios = markup.match(/<input[^>]*type="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(4)
    expect(radios.every((radio) => radio.includes('name="configure-need"'))).toBe(true)
    expect(radios.filter((radio) => radio.includes('checked=""'))).toHaveLength(1)
    expect(radios[0]).toContain('checked=""')
    expect(occurrences(markup, '<label')).toBe(4)
    for (const label of ['Conectar mi cámara a la red y a la aplicación', 'Actualizar el firmware', 'Cambiar o recuperar la contraseña', 'Otra duda de configuración']) {
      expect(markup).toContain(`>${label}</label>`)
    }
    expect(markup).toContain('min-h-14')
    expect(markup).toContain('peer-focus-visible:outline')
  })

  it('lista lo que hay que tener a mano', () => {
    expect(markup).toContain('2. Ten a la mano')
    expect(markup).toContain('El número de factura o pedido')
    expect(markup).toContain('La ciudad donde compraste')
  })

  it('muestra el mensaje inicial y el enlace de WhatsApp con ese mensaje', () => {
    const message = configureSupportMessage('conectar mi cámara a la red y a la aplicación')
    expect(markup).toContain('necesito conectar mi cámara a la red y a la aplicación.')
    expect(markup).toContain('white-space:pre-line')
    const link = anchor(markup, whatsappUrl(message))
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener noreferrer"')
    expect(link).toContain('min-h-12')
    expect(markup).toContain('Escribir por WhatsApp')
  })

  it('remite a diagnóstico y no inventa teléfono ni horario', () => {
    expect(markup).toContain('Eso es diagnóstico o reparación.')
    expect(anchor(markup, '/servicios/soporte')).not.toBe('')
    expect(markup).not.toContain('slate-')
    expect(markup).not.toContain('#CE0203')
  })
})
