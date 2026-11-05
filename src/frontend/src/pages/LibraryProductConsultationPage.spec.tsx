import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ConsultationFiles, ConsultationInformation, ConsultationProduct } from './LibraryProductConsultationPage'
import { sheetFixture } from '../features/products/sheet/fixtures'
import type { Product } from '../features/products/types/product.types'

const product: Product = {
  id: 'p-consult', sku: 'QA-DVR-004', name: 'Grabador ficticio del catálogo', description: 'Descripción de prueba para consulta.',
  categoryId: 'c1', brandId: 'b1', category: { id: 'c1', name: 'Grabadores', slug: 'grabadores' }, brand: { id: 'b1', name: 'Marca de prueba', slug: 'marca-prueba' },
  technicalSpecs: { Canales: 4, Analítica: true }, extraAttributes: { Garantía: 'Prueba' }, isActive: true, isVisible: true, lifecycleStatus: 'PUBLISHED',
  images: [{ id: 'i1', url: '/api/files/qa-photo', isPrimary: true }], prices: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z',
}
const sheet = sheetFixture({ productId: product.id })
const render = (canReadPrices: boolean, overrides = {}) => renderToStaticMarkup(<MemoryRouter><ConsultationProduct product={product} sheet={sheet} canReadPrices={canReadPrices} {...overrides} /></MemoryRouter>)

describe('consulta interna de Biblioteca', () => {
  it('presenta datos comerciales completos sin convertir la consulta en edición', () => {
    const html = render(true)
    for (const content of ['DVR AcuSense de 4 canales', 'QA-DVR-004', 'Lo más destacado', 'Impulsado por tecnología eSSD', 'Características', 'Canales', '1080p', 'Garantía', 'Última actualización']) expect(html).toContain(content)
    for (const forbidden of ['Guardar', 'Editar', 'Publicar', 'Despublicar', 'Notas internas', '<input', '<textarea']) expect(html).not.toContain(forbidden)
    expect(html).toContain('Solo consulta')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-controls="consultation-panel-information"')
  })

  it('solo ofrece Precios con permiso independiente de lectura de precios', () => {
    expect(render(true)).toContain('consultation-tab-prices')
    const html = render(false)
    expect(html).not.toContain('consultation-tab-prices')
    expect(html).not.toContain('Consultar precios')
    expect(html).toContain('consultation-tab-files')
  })

  it('mantiene datos básicos cuando falla o falta la ficha complementaria', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ConsultationProduct product={product} canReadPrices={false} sheetFailed /></MemoryRouter>)
    expect(html).toContain(product.name)
    expect(html).toContain(product.description)
    expect(html).toContain('No se pudo cargar la ficha complementaria')
    expect(html).toContain('Reintentar ficha')
    expect(html).toContain('Canales')
  })

  it('explica ausencias sin inventar una imagen o especificaciones', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ConsultationProduct product={{ ...product, images: [], description: null, technicalSpecs: null, extraAttributes: null }} canReadPrices={false} /></MemoryRouter>)
    expect(html).toContain('Imagen no disponible')
    expect(html).toContain('todavía no tiene una descripción')
    expect(html).not.toContain('Datos técnicos del producto')
  })

  it('no filtra notas internas al presentar información estructurada', () => {
    const html = renderToStaticMarkup(<ConsultationInformation product={product} sheet={sheet} />)
    expect(html).toContain('Referencias del fabricante')
    expect(html).toContain('Modelos disponibles')
    expect(html).not.toContain('Notas internas')
  })

  it('conserva recursos técnicos y la licencia de firmware en el control compartido', () => {
    const html = renderToStaticMarkup(<ConsultationFiles product={product} sheet={sheetFixture({ resources: [{ kind: 'FIRMWARE', title: 'Firmware QA con licencia', language: 'es', url: 'https://example.invalid/qa-firmware.bin', requiresLicense: true, fileName: null, version: '1.0', region: null }, { kind: 'DATASHEET', title: 'Ficha técnica QA', language: 'es', url: '/api/files/qa-pdf', requiresLicense: false, fileName: 'qa.pdf', version: null, region: null }] })} />)
    expect(html).toContain('Ficha técnica QA')
    expect(html).toContain('Firmware QA con licencia')
    expect(html).not.toContain('href="https://example.invalid/qa-firmware.bin"')
  })

  it('incluye documentos anteriores sin repetir los que ya contiene la ficha', () => {
    const html = renderToStaticMarkup(<ConsultationFiles product={{ ...product, documents: [{ name: 'Documento anterior QA', url: '/api/files/old' }, { name: 'Documento duplicado', url: '/api/files/qa-pdf' }] }} sheet={sheetFixture({ resources: [{ kind: 'DATASHEET', title: 'Ficha técnica QA', language: 'es', url: '/api/files/qa-pdf', requiresLicense: false, fileName: 'qa.pdf', version: null, region: null }] })} />)
    expect(html).toContain('Documento anterior QA')
    expect(html).not.toContain('Documento duplicado')
  })
})
