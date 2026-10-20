import { describe, expect, it } from 'vitest'
import {
  describeBatch,
  issueAnchor,
  orderIssues,
  summarizeValidation,
  type BatchSummaryView,
  type ValidationIssueView,
  type ValidationReportView,
} from './validation-model'

const issue = (over: Partial<ValidationIssueView> = {}): ValidationIssueView => ({
  code: 'media.primary_image',
  severity: 'error',
  field: 'images',
  section: 'multimedia',
  message: 'No hay imagen principal.',
  fix: 'Sube una imagen y márcala como principal.',
  ...over,
})

const report = (over: Partial<ValidationReportView> = {}): ValidationReportView => ({
  productId: 'p-1',
  revisionId: 'rev-1',
  status: 'CON_PROBLEMAS',
  issues: [issue(), issue({ code: 'docs.datasheet_missing', severity: 'warning', section: 'documentos', message: 'Sin PDF', fix: 'Añade ficha técnica' })],
  rulesVersion: 'cat05-r1',
  at: '2026-10-17T10:00:00.000Z',
  ...over,
})

describe('summarizeValidation', () => {
  it('sin informe: sin revisar', () => {
    expect(summarizeValidation(null)).toMatchObject({ blocking: false, label: 'sin revisar', chip: '—' })
  })
  it('con errores: bloquea y etiqueta con problemas', () => {
    expect(summarizeValidation(report())).toMatchObject({ errors: 1, warnings: 1, blocking: true, label: 'con problemas' })
  })
  it('solo avisos (sin ficha técnica): NO bloquea', () => {
    const r = report({ status: 'LISTA_PARA_PUBLICAR', issues: [issue({ severity: 'warning', code: 'docs.datasheet_missing' })] })
    expect(summarizeValidation(r).blocking).toBe(false)
    expect(summarizeValidation(r).label).toBe('lista para publicar')
  })
  it('informe obsoleto manda sobre «lista»: revisar vale solo si es vigente', () => {
    const r = report({ status: 'LISTA_PARA_PUBLICAR', issues: [], stale: true })
    const s = summarizeValidation(r)
    expect(s.blocking).toBe(true)
    expect(s.label).toBe('revisión pendiente')
  })
})

describe('orderIssues + issueAnchor (enlaces según permiso)', () => {
  it('errores primero; con permiso de ficha hay ancla; sin permiso, NUNCA', () => {
    const rows = orderIssues([issue({ severity: 'info', section: 'general' }), issue()], true)
    expect(rows[0]?.code).toBe('media.primary_image')
    expect(rows[0]?.anchor).toBe('#ficha-fotos')
    const noPerm = orderIssues([issue()], false)
    expect(noPerm[0]?.anchor).toBeNull()
  })
  it('sección sin destino conocido → sin ancla (no se inventa enlace)', () => {
    expect(issueAnchor(issue({ section: 'desconocida' }), true)).toBeNull()
  })
})

describe('describeBatch', () => {
  const batch = (over: Partial<BatchSummaryView> = {}): BatchSummaryView => ({
    examined: 10,
    valid: 6,
    withErrors: 2,
    omitted: 1,
    failed: 1,
    results: [],
    ...over,
  })
  it('resumen completo con omitidos y fallidos', () => {
    expect(describeBatch(batch())).toContain('1 fallidos (no cuentan como válidos)')
    expect(describeBatch(batch())).toContain('1 fuera de tu alcance')
  })
  it('sin omitidos/fallidos no los menciona', () => {
    const s = describeBatch(batch({ omitted: 0, failed: 0 }))
    expect(s).not.toContain('fallidos')
    expect(s).not.toContain('alcance')
  })
})
