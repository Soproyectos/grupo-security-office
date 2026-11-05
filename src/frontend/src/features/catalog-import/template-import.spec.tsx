import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  buildConfirmUnresolved, canConfirmImport, confirmableSkus, countLines, friendlyImportError, groupIncidents, incidentKey, isAcceptedFileName,
  mappingChoices, previewTabs, progressPercent, shouldKeepPolling, stepStates, toggleAllSkus, toggleSku, upsertResolution, visibleSections, MAX_POLLS,
} from './template-import.helpers'
import { HistoryView, PreviewStep, ProgressBar, ResolveStep, ResultRowItem, ResultView, Stepper, TemplateStep, UploadStep } from './TemplateImportViews'
import type { BatchSummary, PreviewItem, TemplatePreview } from './template-import.types'

const item = (sku: string, extra: Partial<PreviewItem> = {}): PreviewItem => ({
  row: 2, reference: sku, sku, name: `Producto ${sku}`, code: 'CREATE_DRAFT', changes: [], proposals: [], pending: [], protectedBy: [], issues: [], needsConfirmation: false, ...extra,
})

const preview = (over: Partial<TemplatePreview> = {}): TemplatePreview => ({
  previewId: 'p1', fileName: 'a.xlsx', templateVersion: '1', expiresAt: '2030-01-01T00:00:00Z',
  summary: { total: 3, create: 2, update: 1, unchanged: 0, proposed: 0, invalid: 0, incidents: 1, needsConfirmation: 1 },
  creates: [item('A1', { needsConfirmation: true }), item('A2')],
  updates: [item('B1', { changes: [{ field: 'description', before: null, after: 'Nueva' }] })],
  proposals: [item('C1', { proposals: [{ field: 'name', before: 'Viejo', after: 'Nuevo' }], protectedBy: ['name'] })],
  skipped: [], errors: [], unassigned: [],
  mappingIncidents: [{ kind: 'brand', code: 'MAPPING_BRAND_UNKNOWN', sourceText: 'Hikvisoin', skus: ['A1'] }],
  resolutions: [],
  options: { brands: [{ id: 'b1', name: 'Hikvision' }], categories: [{ id: 'c1', name: 'Cámaras' }], subcategories: [{ id: 's1', name: 'Domo', categoryId: 'c1', category: 'Cámaras' }] },
  ...over,
})

const batch = (over: Partial<BatchSummary> = {}): BatchSummary => ({
  batchId: 'batch-secret-id', state: 'COMPLETED', fileName: 'a.xlsx', templateVersion: '1', userName: 'Ana', createdAt: '2026-10-01T10:00:00Z', finishedAt: null,
  total: 10, processed: 4, percent: 40,
  counts: { CREATED: 2, UPDATED: 1, UNCHANGED: 0, PROPOSED: 1, INVALID: 0, STALE: 0, NEEDS_CONFIRMATION: 0, FAILED: 0 }, ...over,
})

describe('stepper', () => {
  it('marks done, current and upcoming steps', () => {
    const states = stepStates('preview').map((s) => s.state)
    expect(states).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming'])
    const html = renderToStaticMarkup(<Stepper stage="upload" />)
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('Subir y validar')
  })
})

describe('step rendering', () => {
  it('template step explains URL vs attached file and the no-create rule', () => {
    const html = renderToStaticMarkup(<TemplateStep busy={false} onDownloadTemplate={() => {}} onDownloadExample={() => {}} onNext={() => {}} />)
    expect(html).toContain('no sube el archivo')
    expect(html).toContain('no crea marcas')
    expect(html).toContain('Descargar ejemplo')
  })

  it('upload step lists structural errors and disables validation without a file', () => {
    const html = renderToStaticMarkup(<UploadStep file={null} busy={false} dragging={false} error={{ message: 'No cumple', details: ['Hoja PRODUCTOS: falta SKU'] }}
      onPick={() => {}} onValidate={() => {}} onBack={() => {}} onDragState={() => {}} onDropFile={() => {}} />)
    expect(html).toContain('Hoja PRODUCTOS: falta SKU')
    expect(html).toMatch(/disabled=""[^>]*>Validar archivo/)
  })

  it('resolve step limits the select to existing masters and shows the confirm checkboxes', () => {
    const p = preview()
    const html = renderToStaticMarkup(<ResolveStep preview={p} canRun busy={false} selectedSkus={['A1']} notice={null}
      onChoose={() => {}} onToggleSku={() => {}} onToggleAll={() => {}} onBack={() => {}} onNext={() => {}} />)
    expect(html).toContain('Hikvision')
    expect(html).not.toContain('Cámaras')
    expect(html).toContain('Sin asociar')
    expect(html).toContain('no crea marcas')
    expect(html).toContain('Producto A1')
    expect(html).not.toContain('Producto A2')
  })

  it('resolve step is read-only without imports:run', () => {
    const html = renderToStaticMarkup(<ResolveStep preview={preview()} canRun={false} busy={false} selectedSkus={[]} notice={null}
      onChoose={() => {}} onToggleSku={() => {}} onToggleAll={() => {}} onBack={() => {}} onNext={() => {}} />)
    expect(html).toContain('disabled=""')
    expect(html).toContain('solo puede consultar')
  })

  it('preview step shows before/after, protected proposals and hides confirm without permission', () => {
    const base = { preview: preview(), canRun: true, canConfirm: true, busy: false, selectedCount: 0, error: null, onTab: () => {}, onBack: () => {}, onConfirm: () => {} }
    const withUpdates = renderToStaticMarkup(<PreviewStep {...base} activeTab="updates" />)
    expect(withUpdates).toContain('(vacío)')
    expect(withUpdates).toContain('Nueva')
    expect(withUpdates).toContain('Confirmar e importar')
    const proposals = renderToStaticMarkup(<PreviewStep {...base} activeTab="proposals" />)
    expect(proposals).toContain('Propuesta, no se aplica')
    const readOnly = renderToStaticMarkup(<PreviewStep {...base} canRun={false} canConfirm={false} activeTab="creates" />)
    expect(readOnly).not.toContain('Confirmar e importar')
  })

  it('result view shows counts and download buttons without internal ids', () => {
    const html = renderToStaticMarkup(<ResultView results={{ batch: batch(), unassigned: [], rows: [] }} onDownload={() => {}} />)
    expect(html).toContain('Descargar Excel')
    expect(html).toContain('Descargar CSV')
    expect(html).toContain('Creado como borrador')
    expect(html).not.toContain('batch-secret-id')
  })

  it('history lists batches with a state-aware action', () => {
    const html = renderToStaticMarkup(<HistoryView items={[batch(), batch({ batchId: 'x2', state: 'PROCESSING' })]} total={2} page={1} pageSize={20} loading={false} error={null} onOpen={() => {}} onPage={() => {}} />)
    expect(html).toContain('Ana')
    expect(html).toContain('Ver resultado')
    expect(html).toContain('Ver avance')
    expect(html).not.toContain('batch-secret-id')
  })

  it('progress bar exposes the percent', () => {
    expect(renderToStaticMarkup(<ProgressBar batch={{ processed: 4, total: 10, state: 'PROCESSING' }} />)).toContain('aria-valuenow="40"')
  })
})

describe('permissions', () => {
  it('read-only users only get the history section', () => {
    expect(visibleSections(false)).toEqual(['history'])
    expect(visibleSections(true)).toEqual(['wizard', 'history'])
    expect(canConfirmImport({ canRun: false, busy: false, preview: preview() })).toBe(false)
    expect(canConfirmImport({ canRun: true, busy: false, preview: preview() })).toBe(true)
    expect(canConfirmImport({ canRun: true, busy: true, preview: preview() })).toBe(false)
    expect(canConfirmImport({ canRun: true, busy: false, preview: preview({ summary: { ...preview().summary, create: 0, update: 0, proposed: 0 } }) })).toBe(false)
  })
})

describe('error mapping', () => {
  const http = (status: number, data?: unknown) => ({ response: { status, data } })
  it('maps statuses to friendly Spanish', () => {
    expect(friendlyImportError(http(403)).message).toContain('no tiene permiso')
    expect(friendlyImportError(http(413)).message).toContain('demasiado grande')
    expect(friendlyImportError(http(409)).message).toContain('cambió')
    expect(friendlyImportError(http(404)).message).toContain('venció')
    expect(friendlyImportError(new Error('boom')).message).toContain('conectar')
  })
  it('lists structural fatal errors', () => {
    const result = friendlyImportError(http(400, { code: 'CATALOG_TEMPLATE_INVALID', message: 'No cumple', fatal: [{ sheet: 'PRODUCTOS', row: 3, message: 'Falta SKU' }] }))
    expect(result.message).toBe('No cumple')
    expect(result.details).toEqual(['Hoja PRODUCTOS, fila 3: Falta SKU'])
  })
  it('accepts only xlsx names', () => {
    expect(isAcceptedFileName('a.XLSX')).toBe(true)
    expect(isAcceptedFileName('a.csv')).toBe(false)
  })
})

describe('preview grouping and mappings', () => {
  it('groups rows per tab with counts', () => {
    const tabs = previewTabs(preview())
    expect(tabs.map((t) => [t.key, t.count])).toEqual([['creates', 2], ['updates', 1], ['proposals', 1], ['skipped', 0], ['errors', 0]])
  })
  it('groups incidents by kind and offers only existing options', () => {
    expect(groupIncidents(preview().mappingIncidents).map((g) => g.kind)).toEqual(['brand'])
    expect(mappingChoices('subcategory', preview().options)).toEqual([{ id: 's1', label: 'Domo (Cámaras)' }])
  })
  it('upserts and removes resolutions case-insensitively', () => {
    const one = upsertResolution([], { kind: 'brand', sourceText: 'Hikvisoin', targetId: 'b1' })
    expect(upsertResolution(one, { kind: 'brand', sourceText: ' hikvisoin ', targetId: 'b2' })).toEqual([{ kind: 'brand', sourceText: ' hikvisoin ', targetId: 'b2' }])
    expect(upsertResolution(one, { kind: 'brand', sourceText: 'HIKVISOIN', targetId: null })).toEqual([])
    expect(incidentKey('brand', 'X ')).toBe('brand:x')
  })
})

describe('confirmUnresolved selection', () => {
  it('only confirmable new products can be selected', () => {
    const p = preview()
    expect(confirmableSkus(p)).toEqual(['A1'])
    expect(toggleSku([], 'A1')).toEqual(['A1'])
    expect(toggleSku(['A1'], 'A1')).toEqual([])
    expect(toggleAllSkus(p, [])).toEqual(['A1'])
    expect(toggleAllSkus(p, ['A1'])).toEqual([])
  })
  it('drops skus that stopped being confirmable after a mapping change', () => {
    const resolved = preview({ creates: [item('A1'), item('A2')] })
    expect(buildConfirmUnresolved(['A1', 'ZZ'], resolved)).toEqual([])
    expect(buildConfirmUnresolved(['A1', 'ZZ'], preview())).toEqual(['A1'])
  })
})

describe('progress helpers', () => {
  it('computes a bounded percent', () => {
    expect(progressPercent(4, 10)).toBe(40)
    expect(progressPercent(15, 10)).toBe(100)
    expect(progressPercent(0, 0)).toBe(100)
    expect(progressPercent(-3, 10)).toBe(0)
    expect(progressPercent(Number.NaN, 10)).toBe(0)
  })
  it('polls only while processing and within the bound', () => {
    expect(shouldKeepPolling('PROCESSING', 1)).toBe(true)
    expect(shouldKeepPolling('PROCESSING', MAX_POLLS)).toBe(false)
    expect(shouldKeepPolling('COMPLETED', 1)).toBe(false)
  })
  it('lists every status count', () => {
    expect(countLines(batch().counts)).toHaveLength(8)
  })
})

it('keeps protected proposal details readable without presenting them as applied', () => {
  const html = renderToStaticMarkup(<ResultRowItem row={{ row: 2, reference: 'P1', sku: 'P1', name: 'Protected', status: 'PROPOSED', code: 'PROTECTED', applied: [], proposals: [{ field: 'name', before: 'Original name', after: 'Proposed name' }], pending: [], issues: [] }} />)
  expect(html).toContain('Original name')
  expect(html).toContain('Proposed name')
  expect(html).toContain('no permite aprobar ni rechazar')
  expect(html).not.toContain('Se aplicó:')
})
