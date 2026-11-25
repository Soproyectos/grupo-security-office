import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import BrandCampaigns from './BrandCampaigns'
import InstagramReels from './InstagramReels'

const render = (element: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, element))

describe('BrandCampaigns', () => {
  it('muestra tres tarjetas que llevan a los productos Hikvision', () => {
    const markup = render(createElement(BrandCampaigns))

    expect(markup).toContain('id="home-campaigns-title"')
    expect(markup.split('<img').length - 1).toBe(3)
    expect(markup.split('href="/catalogo/buscar?brand=hikvision"').length - 1).toBe(4)
  })

  it('no muestra nada sin campañas', () => {
    expect(render(createElement(BrandCampaigns, { campaigns: [] }))).toBe('')
  })
})

describe('InstagramReels', () => {
  const reels = [
    { id: 'a', url: 'https://www.instagram.com/reel/abc/?igsh=1', title: 'Reel A', thumbnail: '/a.jpg' },
    { id: 'b', url: 'https://example.com/reel/x/', title: 'Reel B', thumbnail: '/b.jpg' },
  ]

  it('no renderiza nada con la lista vacía', () => {
    expect(render(createElement(InstagramReels, { reels: [] }))).toBe('')
  })

  it('muestra solo miniaturas y no carga ningún iframe antes del clic', () => {
    const markup = render(createElement(InstagramReels, { reels }))

    expect(markup).toContain('Reel A')
    expect(markup).not.toContain('Reel B')
    expect(markup).not.toContain('<iframe')
    expect(markup).not.toContain('instagram.com')
  })
})
