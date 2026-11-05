import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Product } from '../types/product.types'
import { LivePreviewPanel, type LivePreviewPanelProps } from './LivePreviewPanel'

const product: Product = {
  id: 'prod-1',
  sku: 'IDS-E04HQHI-D',
  name: 'DVR Turbo 4 canales',
  description: null,
  categoryId: 'cat-video',
  brandId: 'brand-hikvision',
  technicalSpecs: null,
  isActive: true,
  isVisible: true,
  category: { id: 'cat-video', name: 'Video', slug: 'video' },
  brand: { id: 'brand-hikvision', name: 'Hikvision', slug: 'hikvision' },
  images: [],
  prices: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const props: LivePreviewPanelProps = {
  product,
  values: { name: 'DVR Turbo 4 canales', brandName: 'Hikvision', description: '' },
  activeField: null,
  activeSection: 'datos-generales',
  onSelectField: () => undefined,
}

describe('LivePreviewPanel', () => {
  it('shows the loading skeleton and the neutral caption when there is no sheet draft', () => {
    const html = renderToStaticMarkup(<LivePreviewPanel {...props} />)

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Preparando la vista previa…')
    expect(html).toContain('<strong>Vista previa</strong>')
    expect(html).toContain('data-empty="false"')
    expect(html).not.toContain('<iframe')
  })

  it('keeps the neutral caption for a section or field that has its own hint when there is no draft', () => {
    const html = renderToStaticMarkup(<LivePreviewPanel {...props} activeField="price" activeSection="publicacion" />)

    expect(html).not.toContain('Publicar')
    expect(html).toContain('Preparando la vista previa…')
  })
})

describe('LivePreviewView draft banner', () => {
  it('always says the preview is a draft', async () => {
    const { LivePreviewView } = await import('./LivePreviewView')
    const html = renderToStaticMarkup(
      <LivePreviewView preview={null} caption={{ title: 'Vista previa', text: 'x', empty: false }} activeField={null} onSelectField={() => undefined} />,
    )
    expect(html).toContain('data-testid="preview-draft-banner"')
    expect(html).toContain('<strong>Borrador</strong>')
    expect(html).toContain('La ficha publicada no cambia')
  })
})
