import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PriceImportPreviewPanel from './PriceImportPreviewPanel'
import PriceImportPreviewResults from './PriceImportPreviewResults'
import { createPreviewRequestGate, formatPreviewPesos, pageItems, validatePreviewFile } from './preview.utils'
import { previewPriceImport, type PriceImportPreview } from '../../services/price-import.service'
import api from '../../services/api'

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))

function fixture(): PriceImportPreview {
  return {
    listaId: 'fixture-list', fileName: 'precios.xlsx', currency: 'COP', taxIncluded: true, rounding: 'HALF_UP', readOnly: true,
    summary: { rows: 2, validRows: 1, errorRows: 1, prices: 1, newPrices: 0, changedPrices: 1, unchangedPrices: 0, roundedPrices: 1 },
    issues: [{ row: null, code: 'TARIFF_MISSING', column: 'DPP_ORO_IVA', message: 'Configura la tarifa Oro.' }],
    rows: [
      { row: 2, sku: '0001-A', status: 'valid', issues: [], prices: [{ code: 'DPP_ORO_IVA', raw: '123456.50', rounded: '123457', previous: '100000', difference: '23457', wasRounded: true, change: 'changed' }] },
      { row: 3, sku: 'UNKNOWN', status: 'error', issues: [{ row: 3, code: 'UNKNOWN_SKU', message: 'No encontramos la referencia.' }], prices: [] },
    ],
  }
}

describe('price template preview', () => {
  it('sends only the file and list to the read-only preview endpoint', async () => {
    const result = fixture()
    vi.mocked(api.post).mockResolvedValueOnce({ data: result })
    const file = new File(['fixture'], 'precios.xlsx')
    const signal = new AbortController().signal
    expect(await previewPriceImport('fixture-list', file, signal)).toEqual(result)
    const calls = vi.mocked(api.post).mock.calls
    const call = calls[calls.length - 1]!
    expect(call[0]).toBe('/prices/import/preview')
    const form = call[1] as FormData
    expect([...form.keys()]).toEqual(['listaId', 'file'])
    expect(form.get('listaId')).toBe('fixture-list')
    expect((form.get('file') as File).name).toBe('precios.xlsx')
    expect(call[2]).toEqual({ signal })
  })

  it('exposes only review in the initial form, with explicit read-only and tax rules', () => {
    const html = renderToStaticMarkup(<PriceImportPreviewPanel listaId="fixture-list" />)
    expect(html).toContain('Revisar archivo')
    expect(html).toContain('no cambia ningún precio')
    expect(html).toContain('incluyen IVA')
    expect(html).toContain('Máximo 5 MB y 5000 filas')
    expect(html).toContain('type="file"')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('Aplicar')
    expect(html).not.toContain('Resultado de revisión')
  })

  it('renders row and configuration errors, all comparison fields, and no write action', () => {
    const html = renderToStaticMarkup(<PriceImportPreviewResults result={fixture()} />)
    for (const text of ['0001-A', 'UNKNOWN', 'Configura la tarifa Oro.', 'No encontramos la referencia.', '$123.457', '$100.000', '$23.457', '123456.50', 'Redondeado', 'IVA incluido', 'No se ha guardado ningún cambio.', 'Filas por página']) expect(html).toContain(text)
    expect(html).toContain('overflow-x-auto')
    expect(html).not.toContain('Aplicar')
  })

  it('paginates complete input rows without losing the last page', () => {
    const rows = Array.from({ length: 101 }, (_, i) => i)
    for (const size of [25, 50] as const) {
      const pages = Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => pageItems(rows, i + 1, size))
      expect(pages.flat()).toEqual(rows)
      expect(pages[pages.length - 1]).toEqual([100])
    }
  })

  it('renders only the first page and provides access to the remaining rows', () => {
    const data = fixture()
    data.rows = Array.from({ length: 26 }, (_, i) => ({ row: i + 2, sku: `SKU-${i}`, status: 'valid', prices: [], issues: [] }))
    const html = renderToStaticMarkup(<PriceImportPreviewResults result={data} />)
    expect(html).toContain('SKU-24')
    expect(html).not.toContain('SKU-25')
    expect(html).toContain('Página 1 de 2')
    expect(html).toContain('Siguiente')
  })

  it('keeps row errors on their page while preserving global errors and the error count', () => {
    const data = fixture()
    const rowIssue = { row: 26, code: 'INVALID_PRICE', message: 'Error exclusivo de la fila 26.' }
    data.rows = Array.from({ length: 26 }, (_, i) => ({ row: i + 1, sku: `SKU-${i}`, status: i === 25 ? 'error' : 'valid', prices: [], issues: i === 25 ? [rowIssue] : [] }))
    data.issues.push(rowIssue)
    data.summary.errorRows = 1
    const html = renderToStaticMarkup(<PriceImportPreviewResults result={data} />)
    expect(html).toContain('Configura la tarifa Oro.')
    expect(html).toContain('Hay 1 fila con problemas.')
    expect(html).toContain('Encontrarás los detalles en cada fila')
    expect(html).not.toContain(rowIssue.message)
    expect(html.match(/<li>/g)).toHaveLength(1)
    expect(pageItems(data.rows, 2, 25)[0]?.issues).toEqual([rowIssue])
  })

  it('rejects oversized files before upload and accepts the exact 5 MB boundary', () => {
    expect(validatePreviewFile({ name: 'precios.xlsx', size: 5 * 1024 * 1024 + 1 })).toContain('supera los 5 MB')
    expect(validatePreviewFile({ name: 'precios.xlsx', size: 5 * 1024 * 1024 })).toBe('')
    expect(validatePreviewFile({ name: 'precios.csv', size: 100 })).toContain('.xlsx')
    expect(validatePreviewFile(null)).toBe('')
  })

  it('invalidates stale work on another request, file/list change or unmount', () => {
    const gate = createPreviewRequestGate()
    const oldRequest = gate.begin()
    const newRequest = gate.begin()
    expect(oldRequest.signal.aborted).toBe(true)
    expect(gate.isCurrent(oldRequest.sequence)).toBe(false)
    expect(gate.isCurrent(newRequest.sequence)).toBe(true)
    gate.invalidate()
    expect(newRequest.signal.aborted).toBe(true)
    expect(gate.isCurrent(newRequest.sequence)).toBe(false)
  })

  it('formats decimal strings without losing large or small differences', () => {
    expect(formatPreviewPesos('9007199254740993')).toBe('$9.007.199.254.740.993')
    expect(formatPreviewPesos('-0.50')).toBe('−$0,50')
    expect(formatPreviewPesos('123456.00')).toBe('$123.456')
    expect(formatPreviewPesos(null)).toBe('Sin precio anterior')
  })
})

// ─── IMP-02 frontend — descarga de plantilla (§3; acceptance backend aplicado a la UI) ───
describe('price template download (IMP-02)', () => {
  it('ofrece Vacía y Con referencias de esta lista con las 5 tarifas IVA', async () => {
    const html = renderToStaticMarkup(<PriceImportPreviewPanel listaId="fixture-list" />)
    expect(html).toContain('Descargar plantilla')
    expect(html).toContain('Vacía')
    expect(html).toContain('Con referencias de esta lista')
    expect(html).toContain('INSTALADOR_IVA')
    expect(html).toContain('DPP_ORO_IVA')
    expect(html).toContain('DPP_PLATINO_IVA')
    expect(html).not.toMatch(/(^|[^_A-Z])ORO_IVA/)
  })

  it('la descarga genera un archivo NUEJO (aviso visible al usuario)', async () => {
    const html = renderToStaticMarkup(<PriceImportPreviewPanel listaId="fixture-list" />)
    expect(html).toContain('archivo nuevo')
    expect(html).not.toMatch(/sobrescribe tus archivos anteriores\.(?! este)/)
  })
})
