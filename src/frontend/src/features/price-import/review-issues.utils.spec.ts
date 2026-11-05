import { describe, expect, it } from 'vitest'
import type { PriceImportRow } from '../../services/price-import.service'
import {
  buildProblemsCsv, countRowsByFilter, csvCell, filterRows, formatChangePercent, groupReviewIssues, issueGroupId, problemsCsvFileName,
} from './review-issues.utils'

const rows: PriceImportRow[] = [
  { row: 2, sku: 'A-1', status: 'valid', issues: [], prices: [
    { code: 'TIENDA_IVA', raw: '150', rounded: '150', previous: '100', difference: '50', wasRounded: false, change: 'changed', changePercent: '50', largeChange: true },
    { code: 'INSTALADOR_IVA', raw: '100', rounded: '100', previous: '100', difference: '0', wasRounded: false, change: 'unchanged', changePercent: 0, largeChange: false },
  ] },
  { row: 3, sku: 'NOPE', status: 'error', issues: [{ row: 3, code: 'UNKNOWN_REFERENCE', message: 'No existe.' }], prices: [] },
  { row: 4, sku: 'B-2', status: 'error', issues: [{ row: 4, code: 'PRICE_REQUIRED', column: 'TIENDA_IVA', message: 'Falta el precio.' }, { row: 4, code: 'WEIRD', message: 'Algo raro.' }], prices: [] },
  { row: 5, sku: 'C-3', status: 'valid', issues: [], prices: [{ code: 'TIENDA_IVA', raw: '10', rounded: '10', previous: null, difference: null, wasRounded: false, change: 'new', changePercent: null }] },
]

const preview = {
  rows,
  issues: [
    { row: null, code: 'TARIFF_UNAVAILABLE', column: 'DPP_ORO_IVA', message: 'Configura la tarifa Oro.' },
    { row: null, code: 'IGNORED_COLUMN', column: 'NOTAS', message: 'Columna ignorada.' },
    { row: 3, code: 'UNKNOWN_REFERENCE', message: 'No existe.' },
  ],
}

describe('groupReviewIssues', () => {
  it('maps backend codes to groups and sends unknown codes to "Otros"', () => {
    expect(issueGroupId('PRICE_OUT_OF_RANGE')).toBe('invalidPrice')
    expect(issueGroupId('REFERENCE_UNAVAILABLE')).toBe('forbidden')
    expect(issueGroupId('LO_QUE_SEA')).toBe('other')
  })

  it('groups in fixed severity order, drops empty groups and counts without duplicates', () => {
    const groups = groupReviewIssues(preview)
    expect(groups.map((g) => g.id)).toEqual(['unknownReference', 'invalidPrice', 'tariffUnavailable', 'largeChanges', 'ignoredColumn', 'other'])
    expect(groups[0]).toMatchObject({ title: 'Referencias que no están en Biblioteca', count: 1, severity: 'error' })
    expect(groups[0]!.items[0]).toEqual({ row: 3, reference: 'NOPE', column: '', detail: 'No existe.' })
    expect(groups[0]!.effect).toContain('No se aplican')
    expect(groups.find((g) => g.id === 'ignoredColumn')!.effect).toContain('Se ignora la columna')
  })

  it('lists large changes with reference, tariff, before, after and percent', () => {
    const large = groupReviewIssues(preview).find((g) => g.id === 'largeChanges')!
    expect(large.count).toBe(1)
    expect(large.items[0]).toMatchObject({ row: 2, reference: 'A-1', column: 'TIENDA_IVA' })
    expect(large.items[0]!.detail).toBe('Antes $100, ahora $150 (+50 %)')
  })

  it('returns no groups when everything is fine', () => {
    expect(groupReviewIssues({ rows: [rows[0]!], issues: [] }).map((g) => g.id)).toEqual(['largeChanges'])
    expect(groupReviewIssues({ rows: [], issues: [] })).toEqual([])
  })
})

describe('formatChangePercent', () => {
  it('formats sign and comma decimals', () => {
    expect(formatChangePercent('12.46')).toBe('+12,5 %')
    expect(formatChangePercent(-30)).toBe('−30 %')
    expect(formatChangePercent(0)).toBe('0 %')
    expect(formatChangePercent(null)).toBe('—')
    expect(formatChangePercent('abc')).toBe('—')
  })
})

describe('row filters', () => {
  it('filters rows and counts each chip', () => {
    expect(filterRows(rows, 'problems').map((r) => r.row)).toEqual([3, 4])
    expect(filterRows(rows, 'changed').map((r) => r.row)).toEqual([2, 5])
    expect(filterRows(rows, 'large').map((r) => r.row)).toEqual([2])
    expect(filterRows(rows, 'unchanged')).toEqual([])
    expect(filterRows(rows, 'all')).toBe(rows)
    expect(countRowsByFilter(rows)).toEqual({ all: 4, problems: 2, changed: 2, unchanged: 0, large: 1 })
  })
})

describe('problems CSV', () => {
  it('starts with BOM, uses ";" and one line per problem', () => {
    const csv = buildProblemsCsv(groupReviewIssues(preview))
    expect(csv.startsWith('﻿Fila Excel;Referencia;Columna;Tipo;Detalle\r\n')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(1 + 6)
    expect(lines).toContain('3;NOPE;;Referencias que no están en Biblioteca;No existe.')
    expect(lines).toContain(';;DPP_ORO_IVA;Tarifas sin configurar;Configura la tarifa Oro.')
  })

  it('quotes separators and quotes, and neutralises formulas', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('di "x"')).toBe('"di ""x"""')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell(null)).toBe('')
  })

  it('builds a safe file name', () => {
    expect(problemsCsvFileName('Precios Marzo (1).xlsx')).toBe('problemas-Precios-Marzo-1.csv')
    expect(problemsCsvFileName('')).toBe('problemas-precios.csv')
  })
})
