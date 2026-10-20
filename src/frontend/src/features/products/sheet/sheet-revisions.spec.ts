import { describe, expect, it } from 'vitest'
import { latestValidation, PENDING_VALIDATION_NOTICE, REVISION_STATUS_LABELS, type RevisionSummaryApi } from './sheet-revisions'

const row = (over: Partial<RevisionSummaryApi> = {}): RevisionSummaryApi => ({
  id: 'rev-1',
  version: 3,
  status: 'REVISION_PENDIENTE',
  notes: null,
  publishedAt: null,
  createdAt: '2026-10-17T12:00:00.000Z',
  ...over,
})

describe('latestValidation (CAT-03 regla 5)', () => {
  it('sin revisiones: estado neutro y no pendiente', () => {
    expect(latestValidation([])).toEqual({ status: null, label: 'sin revisiones', pending: false })
    expect(latestValidation(undefined)).toEqual({ status: null, label: 'sin revisiones', pending: false })
  })

  it('toma la PRIMERA fila (el servidor ya ordena por versión desc)', () => {
    const state = latestValidation([row({ version: 4, status: 'REVISION_PENDIENTE' }), row({ version: 3, status: 'PUBLICADA' })])
    expect(state.status).toBe('REVISION_PENDIENTE')
    expect(state.pending).toBe(true)
    expect(state.label).toBe('revisión pendiente')
  })

  it('solo REVISION_PENDIENTE marca pending; publicada y demás estados no', () => {
    for (const status of ['SIN_REVISAR', 'CON_PROBLEMAS', 'LISTA_PARA_PUBLICAR', 'PUBLICADA'] as const) {
      const state = latestValidation([row({ status })])
      expect(state.pending).toBe(false)
      expect(state.label).toBe(REVISION_STATUS_LABELS[status])
    }
  })

  it('el aviso pendiente dice que la tienda sigue mostrando la versión publicada', () => {
    expect(PENDING_VALIDATION_NOTICE).toContain('revisión pendiente')
    expect(PENDING_VALIDATION_NOTICE).toContain('última versión publicada')
  })
})
