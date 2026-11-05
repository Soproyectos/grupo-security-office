import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SinglePriceSelector from './SinglePriceSelector'
import {
  isSinglePriceSelectionValid, needsNewIdempotencyKey, normalizeSinglePriceSelection, singlePriceBannerText, singlePriceSelectionToSend,
  toggleSinglePriceTariff,
} from './flow.utils'
import { downloadSinglePriceTemplate, previewPriceFile, savePriceFileRevision, type PriceImportPreview } from '../../services/price-import.service'
import api from '../../services/api'

vi.mock('../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }))

const ALL = ['INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA']

describe('single-price helpers', () => {
  it('serializes the selection in canonical order and drops unknown or duplicate codes', () => {
    expect(normalizeSinglePriceSelection(['CLIENTE_FINAL_IVA', 'TIENDA_IVA', 'TIENDA_IVA', 'X'])).toEqual(['TIENDA_IVA', 'CLIENTE_FINAL_IVA'])
    expect(toggleSinglePriceTariff(ALL, 'DPP_ORO_IVA', false)).toEqual(['INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA'])
  })

  it('treats an empty selection as invalid', () => {
    expect(isSinglePriceSelectionValid([])).toBe(false)
    expect(isSinglePriceSelectionValid(['TIENDA_IVA'])).toBe(true)
  })

  it('renews the idempotency key only when the selection changes', () => {
    expect(needsNewIdempotencyKey(ALL, ALL)).toBe(false)
    expect(needsNewIdempotencyKey(ALL, ['TIENDA_IVA'])).toBe(true)
    expect(needsNewIdempotencyKey(['TIENDA_IVA', 'INSTALADOR_IVA'], ['INSTALADOR_IVA', 'TIENDA_IVA'])).toBe(false)
  })

  it('sends a selection only when the preview is single-price', () => {
    const base = { rows: [] } as unknown as PriceImportPreview
    expect(singlePriceSelectionToSend(base, ALL)).toBeUndefined()
    expect(singlePriceSelectionToSend({ ...base, singlePrice: null }, ALL)).toBeUndefined()
    expect(singlePriceSelectionToSend({ ...base, singlePrice: { tariffs: ALL } }, ['TIENDA_IVA'])).toEqual(['TIENDA_IVA'])
  })
})

describe('single-price service', () => {
  it('adds singlePriceTariffs to preview and save only when given', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    const file = new File(['x'], 'p.xlsx')
    await previewPriceFile(file)
    await previewPriceFile(file, [])
    await previewPriceFile(file, ['TIENDA_IVA', 'CLIENTE_FINAL_IVA'])
    await savePriceFileRevision(file, 'k1')
    await savePriceFileRevision(file, 'k2', ['TIENDA_IVA'])
    const forms = vi.mocked(api.post).mock.calls.map((call) => call[1] as FormData)
    expect(forms[0]!.has('singlePriceTariffs')).toBe(false)
    expect(forms[1]!.has('singlePriceTariffs')).toBe(false)
    expect(forms[2]!.get('singlePriceTariffs')).toBe('TIENDA_IVA,CLIENTE_FINAL_IVA')
    expect(forms[3]!.has('singlePriceTariffs')).toBe(false)
    expect(forms[4]!.get('singlePriceTariffs')).toBe('TIENDA_IVA')
  })

  it('requests the single-price template with singlePrice=true and no other params', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: new Blob(['x']), headers: { 'content-disposition': 'attachment; filename="u.xlsx"' } })
    const result = await downloadSinglePriceTemplate()
    expect(result.fileName).toBe('u.xlsx')
    expect(vi.mocked(api.get).mock.calls[0]).toEqual(['/prices/import/template/official', { params: { singlePrice: 'true' }, responseType: 'blob' }])
  })
})

describe('SinglePriceSelector', () => {
  it('renders five checked boxes and the supplier-price banner', () => {
    const html = renderToStaticMarkup(<SinglePriceSelector selected={['TIENDA_IVA', 'CLIENTE_FINAL_IVA']} onChange={() => {}} />)
    expect(html.match(/type="checkbox"/g)).toHaveLength(5)
    expect(html.match(/checked=""/g)).toHaveLength(2)
    expect(html).toContain('role="note"')
    expect(html).toContain(singlePriceBannerText(['TIENDA_IVA', 'CLIENTE_FINAL_IVA']))
    expect(html).toContain('Un precio de proveedor no es un precio de venta')
  })

  it('disables the boxes while loading and shows the error when nothing is chosen', () => {
    const html = renderToStaticMarkup(<SinglePriceSelector selected={[]} disabled onChange={() => {}} />)
    expect(html.match(/disabled=""/g)).toHaveLength(5)
    expect(html).toContain('Elige al menos un escalafón para aplicar el precio único.')
    expect(html).not.toContain('role="note"')
  })
})
