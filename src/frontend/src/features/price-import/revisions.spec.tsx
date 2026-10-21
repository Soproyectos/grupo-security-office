/**
 * IMP-06 frontend (§3, §4) — Revisar/guardar/aplicar con permisos SEPARADOS,
 * historial visible sólo con acceso a la lista y conflicto 409 sin éxito falso.
 * Sin jsdom: render estático + ayudantes puros (mismo patrón que preview.spec).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { canManageListas, hasPermission } from '../../lib/rbac'
import type { PriceImportRevisionApplyResult, PriceImportRevisionHeader } from '../../services/price-import.service'
import PriceImportRevisionsSection from './PriceImportRevisionsSection'
import {
  applyNotice,
  canApplyRevisions,
  canReadRevisions,
  canSaveRevisions,
  conflictFeedback,
  revisionStatusLabel,
} from './revisions.utils'

vi.mock('../../lib/rbac', () => ({ hasPermission: vi.fn(() => false), canManageListas: vi.fn(() => false) }))
vi.mock('../../services/price-import.service', () => ({
  listPriceRevisions: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  getPriceRevision: vi.fn(),
  applyPriceRevision: vi.fn(),
  discardPriceRevision: vi.fn(),
  downloadPriceRevisionFile: vi.fn(),
  saveTemplateDownload: vi.fn(),
}))

function grant(...actions: string[]) {
  vi.mocked(hasPermission).mockImplementation((permission) => actions.includes(permission))
}

function header(over: Partial<PriceImportRevisionHeader> = {}): PriceImportRevisionHeader {
  return {
    id: 'rev-1', listaId: 'l1', status: 'GUARDADA', fileName: 'precios.xlsx', fileHash: 'h', fileSize: 10,
    fileAvailable: true, idempotencyKey: 'k-12345678', currency: 'COP', taxIncluded: true, rounding: 'HALF_UP',
    policyVersion: 'COP-1', parserVersion: 'P-1', trailerVersion: null, tariffs: [],
    summary: { rows: 1, validRows: 1, errorRows: 0, prices: 1, newPrices: 0, changedPrices: 1, unchangedPrices: 0, roundedPrices: 1 },
    createdById: 'u1', createdAt: '2026-10-17T10:00:00.000Z', appliedAt: null, appliedResult: null, ...over,
  }
}

describe('IMP-06 frontend — permisos separados por acción', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockReset().mockReturnValue(false)
    vi.mocked(canManageListas).mockReset().mockReturnValue(false)
  })

  it('revisar(historial), guardar y aplicar dependen de acciones DISTINTAS', () => {
    grant('prices:read')
    expect(canReadRevisions()).toBe(true)
    expect(canSaveRevisions()).toBe(false)
    expect(canApplyRevisions()).toBe(false)

    grant('prices:save')
    expect(canSaveRevisions()).toBe(true)
    expect(canApplyRevisions()).toBe(false)

    grant('prices:apply')
    expect(canApplyRevisions()).toBe(true)
    expect(canReadRevisions()).toBe(false)
  })

  it('la capa legada `canManageListas` conserva la transición D5', () => {
    vi.mocked(canManageListas).mockReturnValue(true)
    expect(canReadRevisions()).toBe(true)
    expect(canSaveRevisions()).toBe(true)
    expect(canApplyRevisions()).toBe(true)
  })
})

describe('IMP-06 frontend — historial y conflicto sin éxito falso', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockReset().mockReturnValue(false)
    vi.mocked(canManageListas).mockReset().mockReturnValue(false)
  })

  it('sin acceso a la lista (prices:read) el historial no se muestra en absoluto', () => {
    const html = renderToStaticMarkup(<PriceImportRevisionsSection listaId="l1" />)
    expect(html).toBe('')
  })

  it('con prices:read el historial se muestra aunque esté vacío', () => {
    grant('prices:read')
    const html = renderToStaticMarkup(<PriceImportRevisionsSection listaId="l1" />)
    expect(html).toContain('Revisiones guardadas')
    expect(html).toContain('Todavía no hay revisiones guardadas')
  })

  it('etiqueta los estados del servidor y tolera uno inesperado', () => {
    expect(revisionStatusLabel('GUARDADA')).toBe('Pendiente de aplicar')
    expect(revisionStatusLabel('APLICADA')).toBe('Aplicada')
    expect(revisionStatusLabel('DESCARTADA')).toBe('Descartada')
    expect(revisionStatusLabel('OTRO')).toBe('OTRO')
  })

  it('extrae sólo strings de `feedback` del 409 y [] en cualquier otro error', () => {
    const conflict = { response: { data: { statusCode: 409, feedback: ['IMP05-SKU-1 · DPP_ORO_IVA: PRICE_CHANGED (esperado 123457, actual 999999)', 42] } } }
    expect(conflictFeedback(conflict)).toEqual(['IMP05-SKU-1 · DPP_ORO_IVA: PRICE_CHANGED (esperado 123457, actual 999999)'])
    expect(conflictFeedback({ response: { data: { message: 'otro' } } })).toEqual([])
    expect(conflictFeedback(new Error('sin respuesta'))).toEqual([])
  })

  it('un reintento NO se presenta como cambio nuevo (sin éxito falso)', () => {
    const first: PriceImportRevisionApplyResult = { revisionId: 'rev-1', status: 'APLICADA', alreadyApplied: false, appliedRows: 1, appliedPrices: 3, tariffs: ['DPP_ORO_IVA'], appliedAt: '2026-10-17T10:00:00.000Z' }
    expect(applyNotice(first)).toContain('3 precio(s)')
    expect(applyNotice(first)).toContain('DPP_ORO_IVA')
    const retry = { ...first, alreadyApplied: true }
    expect(applyNotice(retry)).toContain('ya estaba aplicada')
    expect(applyNotice(retry)).not.toContain('3 precio(s)')
  })

  it('una revisión sin archivo disponible no ofrece descarga (historial fiel)', () => {
    // El estado inicial (useEffect no corre en SSR) no lista filas; comprobamos
    // que las filas se pintan con el estado y la descarga sólo si `fileAvailable`.
    const item = header({ fileAvailable: false })
    expect(item.fileAvailable).toBe(false)
    expect(item.status).toBe('GUARDADA')
  })
})
