import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductPhotosSection, PublishedImagesNotice } from './ProductPhotosSection'
import { publishedImagesNotice } from './published-images'
import type { Product } from '../types/product.types'

vi.mock('./sheet.service', () => ({
  fetchPublishedImages: vi.fn().mockResolvedValue(null),
}))

const product = {
  id: 'p-1',
  name: 'DVR Turbo',
  sku: 'DVR-1',
  images: [
    { id: 'i-1', url: '/api/files/live-1', alt: 'Viva', isPrimary: true, type: 'PRINCIPAL', sortOrder: 0 },
  ],
} as unknown as Product

const renderSection = () =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ProductPhotosSection, { product })),
  )

describe('PublishedImagesNotice (CAT-04 frontend-imagenes)', () => {
  it('con diferencias muestra el aviso con el conteo y la promesa de conservación', () => {
    const notice = publishedImagesNotice(['/api/files/live-1', '/api/files/nueva'], [{ src: '/api/files/live-1', alt: 'Viva' }])
    const html = renderToStaticMarkup(createElement(PublishedImagesNotice, { notice }))
    expect(html).toContain('1 aún no visible')
    expect(html).toContain('NO cambia lo que ve la tienda')
    expect(html).toContain('publicada anterior se conserva')
  })

  it('sin diferencias (o sin publicación) no pinta nada', () => {
    const igual = publishedImagesNotice(['/api/files/a'], [{ src: '/api/files/a', alt: 'A' }])
    expect(renderToStaticMarkup(createElement(PublishedImagesNotice, { notice: igual }))).toBe('')
    const sinPublicar = publishedImagesNotice(['/api/files/a'], null)
    expect(renderToStaticMarkup(createElement(PublishedImagesNotice, { notice: sinPublicar }))).toBe('')
  })
})

describe('ProductPhotosSection (render)', () => {
  it('renderiza la cuadrícula del borrador vivo sin avisos mientras no hay comparación', () => {
    const html = renderSection()
    expect(html).toContain('Subir imagen')
    expect(html).toContain('alt="Viva"')
    // Mientras la consulta de lo publicado no resuelve (SSR), no se inventa aviso.
    expect(html).not.toContain('published-images-notice')
  })
})
