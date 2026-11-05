import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import PageIntro, { type PageIntroProps } from './PageIntro'

function renderIntro(props: PageIntroProps): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PageIntro, props)))
}

const base: PageIntroProps = {
  breadcrumbs: [{ label: 'Inicio', to: '/' }, { label: 'Servicios', to: '/servicios' }, { label: 'Mantenimiento' }],
  title: 'Mantenimiento preventivo',
  description: 'Cuidamos tus equipos.',
}

describe('encabezado de página de la tienda', () => {
  it('renderiza un único h1 con el título', () => {
    const markup = renderIntro(base)
    expect(markup.match(/<h1/g)).toHaveLength(1)
    expect(markup).toMatch(/<h1[^>]*>Mantenimiento preventivo<\/h1>/)
  })

  it('usa enlaces en las migas intermedias y marca la actual', () => {
    const markup = renderIntro(base)
    expect(markup).toContain('aria-label="Ruta"')
    expect(markup).toMatch(/<a[^>]*href="\/"[^>]*>Inicio<\/a>/)
    expect(markup).toMatch(/<a[^>]*href="\/servicios"[^>]*>Servicios<\/a>/)
    expect(markup).toMatch(/<span[^>]*aria-current="page"[^>]*>Mantenimiento<\/span>/)
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('oculta los separadores a lectores de pantalla', () => {
    expect(renderIntro(base)).toContain('aria-hidden="true"')
  })

  it('omite la descripción cuando no se da', () => {
    const markup = renderIntro({ ...base, description: undefined })
    expect(markup).not.toContain('<p')
  })
})
