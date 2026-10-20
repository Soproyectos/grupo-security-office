/**
 * IMP-02 frontend — servicio de descarga de plantilla (§3 contrato).
 * RED observado: `downloadPriceTemplate` aún no existe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'
import {
  applyPriceRevision,
  createProviderProfile,
  createRevisionIdempotencyKey,
  deleteProviderProfile,
  discardPriceRevision,
  downloadPriceRevisionFile,
  downloadPriceTemplate,
  exportListaPrices,
  getPriceRevision,
  listPriceRevisions,
  listProviderProfiles,
  parseTemplateFileName,
  recognizeProviderProfile,
  resolveProviderReferences,
  savePriceRevision,
  saveTemplateDownload,
  setProviderEquivalences,
  updateProviderProfile,
} from './price-import.service'

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('downloadPriceTemplate (IMP-02)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pide la plantilla NUEVA con mode y tariffs como parámetros (nunca toca el archivo del usuario)', async () => {
    const blob = new Blob([new Uint8Array([0x50, 0x4b])])
    vi.mocked(api.get).mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="plantilla-precios-L1-2026-10-17.xlsx"' },
    })
    const result = await downloadPriceTemplate('lista-1', 'referencias', ['ORO_IVA'])
    expect(api.get).toHaveBeenCalledWith('/prices/import/template', {
      params: { listaId: 'lista-1', mode: 'referencias', tariffs: 'ORO_IVA' },
      responseType: 'blob',
    })
    expect(result.blob).toBe(blob)
    expect(result.fileName).toBe('plantilla-precios-L1-2026-10-17.xlsx')
  })

  it('mode=vacias sin tariffs usa el default del servidor (sin enviar la lista de tarifas)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(), headers: {} })
    await downloadPriceTemplate('lista-1', 'vacias')
    expect(api.get).toHaveBeenCalledWith('/prices/import/template', {
      params: { listaId: 'lista-1', mode: 'vacias' },
      responseType: 'blob',
    })
  })

  it('sin content-disposition el nombre sigue siendo utilizable (fallback)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(), headers: {} })
    const result = await downloadPriceTemplate('lista-1', 'vacias')
    expect(result.fileName).toBe('plantilla-precios.xlsx')
  })

  it('parseTemplateFileName extrae el nombre del header', () => {
    expect(parseTemplateFileName('attachment; filename="plantilla-precios-L9-2026-10-17.xlsx"')).toBe('plantilla-precios-L9-2026-10-17.xlsx')
    expect(parseTemplateFileName(undefined)).toBe('plantilla-precios.xlsx')
  })

  it('saveTemplateDownload dispara la descarga del blob con el nombre del servidor (sin jsdom: globals stubeados)', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = { href: '', download: '', click, remove, setAttribute: vi.fn() }
    const appendChild = vi.fn(() => anchor)
    const createObjectURL = vi.fn(() => 'blob:fixture')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild } })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    try {
      saveTemplateDownload(new Blob(), 'plantilla-X.xlsx')
      expect(createObjectURL).toHaveBeenCalled()
      expect(anchor.download).toBe('plantilla-X.xlsx')
      expect(click).toHaveBeenCalled()
      expect(remove).toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture')
      expect(appendChild).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('IMP-06 — revisión persistida, aplicar e historial', () => {
  beforeEach(() => vi.clearAllMocks())

  it('savePriceRevision envía listaId + idempotencyKey + archivo (no manda filas ni precios)', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'rev-1', status: 'GUARDADA' } })
    const file = new File([new Uint8Array([0x50, 0x4b])], 'precios.xlsx')
    const header = await savePriceRevision('lista-1', file, 'key-abc-12345678')
    expect(api.post).toHaveBeenCalledWith('/prices/import/revisions', expect.any(FormData), { signal: undefined })
    const form = vi.mocked(api.post).mock.calls[0]![1] as FormData
    expect(form.get('listaId')).toBe('lista-1')
    expect(form.get('idempotencyKey')).toBe('key-abc-12345678')
    expect(form.get('file')).toBe(file)
    expect(header).toMatchObject({ id: 'rev-1' })
  })

  it('listPriceRevisions pide el historial de la lista con paginación', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0, page: 2, pageSize: 25 } })
    await listPriceRevisions('lista-1', 2, 25)
    expect(api.get).toHaveBeenCalledWith('/prices/import/revisions', { params: { listaId: 'lista-1', page: '2', pageSize: '25' } })
  })

  it('getPriceRevision consulta el detalle por id', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'rev-9', rows: [] } })
    await getPriceRevision('rev-9')
    expect(api.get).toHaveBeenCalledWith('/prices/import/revisions/rev-9', { params: {} })
  })

  it('applyPriceRevision usa la ruta de aplicar (permiso separado)', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { status: 'APLICADA', alreadyApplied: false } })
    const result = await applyPriceRevision('rev-9')
    expect(api.post).toHaveBeenCalledWith('/prices/import/revisions/rev-9/apply')
    expect(result).toMatchObject({ status: 'APLICADA', alreadyApplied: false })
  })

  it('discardPriceRevision borra con DELETE', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { status: 'DESCARTADA' } })
    const result = await discardPriceRevision('rev-9')
    expect(api.delete).toHaveBeenCalledWith('/prices/import/revisions/rev-9')
    expect(result.status).toBe('DESCARTADA')
  })

  it('downloadPriceRevisionFile descarga el binario y usa el nombre del servidor', async () => {
    const blob = new Blob([new Uint8Array([0x50, 0x4b])])
    vi.mocked(api.get).mockResolvedValue({ data: blob, headers: { 'content-disposition': 'attachment; filename="revision-L1.xlsx"' } })
    const result = await downloadPriceRevisionFile('rev-9')
    expect(api.get).toHaveBeenCalledWith('/prices/import/revisions/rev-9/file', { responseType: 'blob' })
    expect(result.blob).toBe(blob)
    expect(result.fileName).toBe('revision-L1.xlsx')
  })

  it('createRevisionIdempotencyKey devuelve una clave no vacía y distinta cada vez', () => {
    const a = createRevisionIdempotencyKey()
    const b = createRevisionIdempotencyKey()
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(8)
    expect(a).not.toBe(b)
  })
})

describe('IMP-07 (07A) — exportación de la lista', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exportListaPrices pide el binario de ESA lista con las tarifas seleccionadas', async () => {
    const blob = new Blob([new Uint8Array([0x50, 0x4b])])
    vi.mocked(api.get).mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="lista-L-1-2026-10-17.xlsx"' },
    })
    const result = await exportListaPrices('lista-1', ['ORO_IVA', 'INSTALADOR_IVA'])
    expect(api.get).toHaveBeenCalledWith('/prices/import/export', {
      params: { listaId: 'lista-1', tariffs: 'ORO_IVA,INSTALADOR_IVA' },
      responseType: 'blob',
    })
    expect(result.blob).toBe(blob)
    expect(result.fileName).toBe('lista-L-1-2026-10-17.xlsx')
  })

  it('sin tarifas no envía el parámetro tariffs (el servidor decide el alcance autorizado)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(), headers: {} })
    await exportListaPrices('lista-1')
    expect(api.get).toHaveBeenCalledWith('/prices/import/export', {
      params: { listaId: 'lista-1' },
      responseType: 'blob',
    })
  })
})

describe('IMP-07B (07B) — perfiles de proveedor', () => {
  beforeEach(() => vi.clearAllMocks())

  const profile = {
    id: 'p1', providerName: 'Hikvision', sheet: 'PRECIOS', headerRow: 1,
    thousandsSeparator: '.', decimalSeparator: ',', currency: 'COP',
    tariffs: ['ORO_IVA'], expectedColumns: ['REFERENCIA'],
    version: 1, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z', equivalences: [],
  }

  it('crear envía el formato declarado (no heurísticas) y devuelve el perfil', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: profile })
    const input = {
      providerName: 'Hikvision', sheet: 'PRECIOS', headerRow: 1,
      thousandsSeparator: '.', decimalSeparator: ',', currency: 'COP',
      tariffs: ['ORO_IVA'], expectedColumns: ['REFERENCIA'],
    }
    const result = await createProviderProfile(input)
    expect(api.post).toHaveBeenCalledWith('/prices/import/profiles', input)
    expect(result.id).toBe('p1')
  })

  it('actualizar y borrar usan la ruta del perfil', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { ...profile, version: 2 } })
    const updated = await updateProviderProfile('p1', {
      providerName: 'Hikvision', sheet: 'PRECIOS', headerRow: 2,
      thousandsSeparator: '.', decimalSeparator: ',', currency: 'COP',
      tariffs: ['ORO_IVA'], expectedColumns: ['REFERENCIA'],
    })
    expect(api.put).toHaveBeenCalledWith('/prices/import/profiles/p1', expect.objectContaining({ headerRow: 2 }))
    expect(updated.version).toBe(2)

    vi.mocked(api.delete).mockResolvedValue({ data: { id: 'p1', deleted: true } })
    await deleteProviderProfile('p1')
    expect(api.delete).toHaveBeenCalledWith('/prices/import/profiles/p1')
  })

  it('las equivalencias se guardan con la referencia externa y el producto', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: profile })
    await setProviderEquivalences('p1', [{ externalRef: 'DS-2CD', productId: 'prod-1' }])
    expect(api.put).toHaveBeenCalledWith('/prices/import/profiles/p1/equivalences', {
      equivalences: [{ externalRef: 'DS-2CD', productId: 'prod-1' }],
    })
  })

  it('reconocer compara el encabezado y resolver marca pendientes', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { found: true, profileId: 'p1', providerName: 'Hikvision', version: 1, matches: true, requiresReview: false, expectedColumns: ['REFERENCIA'] },
    })
    const recognition = await recognizeProviderProfile('Hikvision', ['REFERENCIA'])
    expect(api.post).toHaveBeenCalledWith('/prices/import/profiles/recognize', { providerName: 'Hikvision', headers: ['REFERENCIA'] })
    expect(recognition.requiresReview).toBe(false)

    vi.mocked(api.post).mockResolvedValue({
      data: { profileId: 'p1', resolution: [{ externalRef: 'X', productId: null, status: 'pending' }] },
    })
    const resolved = await resolveProviderReferences('p1', ['X'])
    expect(api.post).toHaveBeenCalledWith('/prices/import/profiles/p1/resolve', { references: ['X'] })
    expect(resolved.resolution[0]?.status).toBe('pending')
  })

  it('listar perfiles usa la ruta de colección', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [profile] })
    const list = await listProviderProfiles()
    expect(api.get).toHaveBeenCalledWith('/prices/import/profiles')
    expect(list).toHaveLength(1)
  })
})
