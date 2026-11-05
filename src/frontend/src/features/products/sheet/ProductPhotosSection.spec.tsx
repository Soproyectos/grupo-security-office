import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  PhotoMutationError,
  PhotoRemovalPanel,
  ProductPhotosSection,
  PublishedImagesNotice,
} from './ProductPhotosSection'
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

const renderWith = (value: Product) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ProductPhotosSection, { product: value })),
  )

const renderSection = () => renderWith(product)

describe('PublishedImagesNotice (CAT-04 frontend-imagenes)', () => {
  it('con diferencias muestra el aviso con el conteo y la promesa de conservación', () => {
    const notice = publishedImagesNotice(['/api/files/live-1', '/api/files/nueva'], [{ url: '/api/files/live-1', alt: 'Viva' }])
    const html = renderToStaticMarkup(createElement(PublishedImagesNotice, { notice }))
    expect(html).toContain('1 aún no visible')
    expect(html).toContain('NO cambia lo que ve la tienda')
    expect(html).toContain('publicada anterior se conserva')
  })

  it('sin diferencias (o sin publicación) no pinta nada', () => {
    const igual = publishedImagesNotice(['/api/files/a'], [{ url: '/api/files/a', alt: 'A' }])
    expect(renderToStaticMarkup(createElement(PublishedImagesNotice, { notice: igual }))).toBe('')
    const sinPublicar = publishedImagesNotice(['/api/files/a'], null)
    expect(renderToStaticMarkup(createElement(PublishedImagesNotice, { notice: sinPublicar }))).toBe('')
  })
})

describe('ProductPhotosSection (render)', () => {
  it('mantiene la ficha visible cuando llega la galería pública con url', () => {
    const client = new QueryClient()
    client.setQueryData(['published-images', product.id], [{ url: '/api/files/live-1', alt: 'Viva' }])
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(ProductPhotosSection, { product })),
    )
    expect(html).toContain('Subir fotos')
    expect(html).toContain('alt="Viva"')
    expect(html).not.toContain('published-images-notice')
  })

  it('renderiza la cuadrícula del borrador vivo sin avisos mientras no hay comparación', () => {
    const html = renderSection()
    expect(html).toContain('Subir fotos')
    expect(html).toContain('alt="Viva"')
    // Mientras la consulta de lo publicado no resuelve (SSR), no se inventa aviso.
    expect(html).not.toContain('published-images-notice')
  })

  it('mantiene independientes la clasificación y la principal en una galería con dos imágenes', () => {
    const twoImages = {
      ...product,
      images: [
        product.images![0],
        { id: 'i-2', url: '/api/files/extra-2', alt: 'Complementaria', isPrimary: false, type: 'COMPLEMENTARIA', sortOrder: 1 },
      ],
    } as Product
    const html = renderWith(twoImages)

    expect(html.match(/<img\b/g)).toHaveLength(2)
    expect(html.match(/<label[^>]*>Tipo de imagen<select\b/g)).toHaveLength(2)
    expect(html).toContain('<option value="COMPLEMENTARIA" selected="">Complementaria</option>')
    expect(html).toContain('Principal del producto')
    expect(html).toContain('Hacer principal del producto')
    expect(html).toContain('El tipo clasifica la imagen y es independiente de la foto principal del producto.')
  })

  it('muestra los errores de mutación en el flujo de edición', () => {
    const html = renderToStaticMarkup(
      createElement(PhotoMutationError, {
        error: { response: { data: { message: 'No se pudo persistir el tipo solicitado.' } } },
        fallback: 'No se pudo guardar el tipo de imagen.',
      }),
    )

    expect(html).toContain('No se pudo persistir el tipo solicitado.')
  })
})

describe('ProductPhotosSection (subida en cola y quitar en la página)', () => {
  it('el selector de archivos acepta varios a la vez', () => {
    const html = renderSection()
    expect(html).toMatch(/<input\b(?=[^>]*\btype="file")(?=[^>]*\bmultiple="")[^>]*>/)
  })

  it('ofrece el tipo de las fotos nuevas, con Principal por defecto', () => {
    const html = renderSection()
    expect(html).toMatch(/Tipo de las fotos nuevas<\/span><select\b/)
    expect(html).toMatch(/Tipo de las fotos nuevas<\/span><select[^>]*>(?:<option[^>]*>[^<]*<\/option>)*?<option value="PRINCIPAL" selected="">/)
  })

  it('no usa el aviso nativo del navegador para quitar', () => {
    const html = renderSection()
    expect(html).not.toContain('¿Eliminar esta imagen?')
  })

  it('cada foto tiene su «Quitar» y no muestra la confirmación hasta pulsarlo', () => {
    const html = renderSection()
    expect(html).toContain('aria-label="Quitar la foto 1"')
    expect(html).not.toContain('¿Quitar esta foto?')
  })

  it('sin fotos guía a subir la primera para poder publicar', () => {
    const html = renderWith({ ...product, images: [] } as Product)
    expect(html).toContain('Aún no hay fotos. Sube la primera para poder publicar el producto.')
  })
})

describe('PhotoRemovalPanel (confirmación dentro de la tarjeta)', () => {
  const noop = () => {}

  it('pregunta y ofrece Quitar y Cancelar', () => {
    const html = renderToStaticMarkup(
      createElement(PhotoRemovalPanel, { phase: 'confirming', isPrimary: false, errorMessage: '', onConfirm: noop, onCancel: noop }),
    )
    expect(html).toContain('¿Quitar esta foto?')
    expect(html).toContain('>Quitar</button>')
    expect(html).toContain('>Cancelar</button>')
    expect(html).not.toContain('Es la foto principal')
  })

  it('si es la foto principal lo dice antes de confirmar', () => {
    const html = renderToStaticMarkup(
      createElement(PhotoRemovalPanel, { phase: 'confirming', isPrimary: true, errorMessage: '', onConfirm: noop, onCancel: noop }),
    )
    expect(html).toContain('Es la foto principal: el producto necesita una para poder publicarse.')
  })

  it('mientras se borra, Quitar muestra carga y los dos botones quedan desactivados', () => {
    const html = renderToStaticMarkup(
      createElement(PhotoRemovalPanel, { phase: 'deleting', isPrimary: false, errorMessage: '', onConfirm: noop, onCancel: noop }),
    )
    expect(html).toContain('animate-spin')
    expect(html.match(/disabled=""/g)).toHaveLength(2)
  })

  it('un fallo muestra el error en la misma tarjeta con Reintentar', () => {
    const html = renderToStaticMarkup(
      createElement(PhotoRemovalPanel, {
        phase: 'failed',
        isPrimary: false,
        errorMessage: 'No se pudo quitar la foto.',
        onConfirm: noop,
        onCancel: noop,
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudo quitar la foto.')
    expect(html).toContain('>Reintentar</button>')
    expect(html).not.toContain('¿Quitar esta foto?')
  })
})
