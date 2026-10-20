/**
 * IMP-07 (07A) frontend — la exportación se muestra solo con `prices:read`
 * (el servidor revalida). Sin jsdom: render estático (patrón de preview.spec).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { canManageListas, hasPermission } from '../../lib/rbac'
import ExportListaSection from './ExportListaSection'
import { canExportPrices } from './export-prices.utils'

vi.mock('../../lib/rbac', () => ({ hasPermission: vi.fn(() => false), canManageListas: vi.fn(() => false) }))
vi.mock('../../services/price-import.service', () => ({
  exportListaPrices: vi.fn(async () => ({ blob: new Blob(), fileName: 'lista.xlsx' })),
  saveTemplateDownload: vi.fn(),
}))

describe('IMP-07 (07A) frontend — exportación de la lista', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockReset().mockReturnValue(false)
    vi.mocked(canManageListas).mockReset().mockReturnValue(false)
  })

  it('sin `prices:read` la sección de exportación no se muestra', () => {
    expect(canExportPrices()).toBe(false)
    expect(renderToStaticMarkup(<ExportListaSection listaId="l1" />)).toBe('')
  })

  it('con `prices:read` se muestra el botón de exportar', () => {
    vi.mocked(hasPermission).mockImplementation((permission) => permission === 'prices:read')
    expect(canExportPrices()).toBe(true)
    const html = renderToStaticMarkup(<ExportListaSection listaId="l1" />)
    expect(html).toContain('Exportar precios')
    expect(html).toContain('Exportar precios (.xlsx)')
  })

  it('la capa legada `canManageListas` también habilita la exportación', () => {
    vi.mocked(canManageListas).mockReturnValue(true)
    expect(canExportPrices()).toBe(true)
  })
})
