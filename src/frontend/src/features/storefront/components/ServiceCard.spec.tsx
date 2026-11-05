import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import ServiceCard, { type ServiceCardProps } from './ServiceCard'

function renderCard(props: ServiceCardProps): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ServiceCard, props)))
}

const common = {
  title: 'Soporte técnico',
  description: 'Atención para tus equipos.',
  actionLabel: 'Solicitar soporte',
  iconPath: 'M4 4h16v16H4z',
}

describe('tarjeta de servicio', () => {
  it('con "to" enlaza a una ruta interna sin target', () => {
    const markup = renderCard({ ...common, to: '/servicios/soporte' })
    const link = markup.match(/<a\s[^>]*>/)?.[0] ?? ''
    expect(link).toContain('href="/servicios/soporte"')
    expect(link).not.toContain('target=')
    expect(markup).toContain('Solicitar soporte')
  })

  it('con "href" abre en otra pestaña de forma segura', () => {
    const link = renderCard({ ...common, href: 'https://example.com/ayuda' }).match(/<a\s[^>]*>/)?.[0] ?? ''
    expect(link).toContain('href="https://example.com/ayuda"')
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener noreferrer"')
  })

  it('oculta el icono y usa h2 para el título', () => {
    const markup = renderCard({ ...common, to: '/x' })
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(markup).toContain('<path d="M4 4h16v16H4z"')
    expect(markup).toMatch(/<h2[^>]*>Soporte técnico<\/h2>/)
    expect(markup).not.toContain('<h1')
  })

  it('no anida enlaces y ancla la acción abajo', () => {
    const markup = renderCard({ ...common, to: '/x' })
    expect(markup.match(/<a /g)).toHaveLength(1)
    expect(markup).toContain('mt-auto')
    expect(markup).toContain('min-h-11')
  })

  it('highlight cambia la clase de borde', () => {
    expect(renderCard({ ...common, to: '/x' })).toContain('border-surface-200')
    const highlighted = renderCard({ ...common, to: '/x', highlight: true })
    expect(highlighted).toContain('border-security-600')
    expect(highlighted).not.toContain('border-surface-200')
  })
})
