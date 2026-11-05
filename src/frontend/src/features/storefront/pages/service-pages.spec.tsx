import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ServicesPage from './ServicesPage'
import ProjectsPage from './ProjectsPage'
import CertificationsPage from './CertificationsPage'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'

function render(page: ComponentType, path: string): string {
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

describe.each([
  ['servicios', ServicesPage, '/servicios', 'Servicios'],
  ['proyectos', ProjectsPage, '/servicios/proyectos', 'Asesoría para proyectos'],
  ['certificaciones', CertificationsPage, '/servicios/certificaciones', 'Certificaciones HCSA Hikvision'],
])('página de %s', (_name, page, path, title) => {
  const markup = render(page, path)

  it('tiene un solo <main> y un solo <h1>', () => {
    expect(occurrences(markup, '<main')).toBe(1)
    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain(`${title}</h1>`)
  })

  it('enlaza Inicio a la tienda y no usa colores sueltos', () => {
    expect(markup).toContain('href="/tienda"')
    expect(markup).not.toContain('slate-')
    expect(markup).not.toContain('#CE0203')
  })

  it('todo enlace externo con target _blank lleva rel noopener noreferrer', () => {
    const anchors = markup.match(/<a [^>]*target="_blank"[^>]*>/g) ?? []
    for (const anchor of anchors) {
      // The shared chrome writes the same pair in the other order.
      expect(anchor).toMatch(/rel="[^"]*noopener[^"]*"/)
      expect(anchor).toMatch(/rel="[^"]*noreferrer[^"]*"/)
    }
  })
})

describe('página de servicios', () => {
  const markup = render(ServicesPage, '/servicios')

  it('muestra las tres tarjetas con sus destinos', () => {
    expect(markup).toContain('href="/servicios/proyectos"')
    expect(markup).toContain('href="/servicios/soporte"')
    expect(markup).toContain('href="/servicios/certificaciones"')
    expect(markup).toContain('Elegir tipo de ayuda')
  })

  it('ofrece configurar el equipo recién comprado', () => {
    expect(markup).toContain('¿Acabas de comprar una cámara?')
    expect(markup).toContain('href="/servicios/soporte/configurar"')
    expect(markup).toContain('Configurar mi equipo')
  })
})

describe('página de asesoría para proyectos', () => {
  const markup = render(ProjectsPage, '/servicios/proyectos')

  it('lista tres pasos numerados en una lista ordenada', () => {
    expect(markup).toContain('<ol')
    for (const step of ['Evaluación', 'Diseño e implementación', 'Mantenimiento y soporte']) {
      expect(markup).toContain(step)
    }
  })

  it('cotiza por WhatsApp con el mensaje de proyectos', () => {
    expect(markup).toContain(`href="${whatsappUrl(WHATSAPP_MESSAGES.projects)}"`)
    expect(markup).toContain('Cotizar por WhatsApp')
  })
})

describe('página de certificaciones', () => {
  const markup = render(CertificationsPage, '/servicios/certificaciones')

  it('lista los temas y pide las fechas por WhatsApp sin inventarlas y no envía al sitio anterior', () => {
    for (const topic of ['CCTV', 'Sistema de alarmas', 'Intercomunicaciones', 'Control de acceso', 'Manejo de software de gestión Hik-Central']) {
      expect(markup).toContain(topic)
    }
    expect(markup).not.toContain('gruposecurity.co')
    expect(markup).toContain('href="https://wa.me/')
    expect(markup).toContain('rel="noopener noreferrer"')
  })

  it('remite a Soporte técnico', () => {
    expect(markup).toContain('href="/servicios/soporte"')
  })
})
