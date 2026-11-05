import { describe, expect, it, vi } from 'vitest'
import {
  buildOptionsPayload,
  canShowApproveButton,
  impactLines,
  mapMasterError,
  matchesQuery,
  runWithImpactConfirmation,
  slugify,
  snakeKey,
  usageSummary,
} from './masters-rules'

const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } })

describe('mapMasterError', () => {
  it('shows the colliding record on duplicate names and slugs', () => {
    const name = mapMasterError(http(409, { code: 'NAME_DUPLICATED', message: 'x', existing: { id: 'secret-id', name: 'Cámaras IP' } }))
    expect(name.kind).toBe('duplicate')
    expect(name.message).toContain('«Cámaras IP»')
    expect(name.message).not.toContain('secret-id')
    expect(mapMasterError(http(409, { code: 'SLUG_DUPLICATED', existing: { name: 'Domos' } })).existingName).toBe('Domos')
    expect(mapMasterError(http(409, { code: 'label_duplicated', details: { existing: { id: 'i', label: 'Resolución' } } })).existingName).toBe('Resolución')
  })

  it('explains a refused delete with its dependency detail', () => {
    const mapped = mapMasterError(http(409, { code: 'DELETE_BLOCKED', message: 'x', usage: { counts: {}, reasons: [{ message: 'tiene 3 producto(s)' }, { message: 'tiene 1 subcategoría(s)' }] } }))
    expect(mapped.kind).toBe('delete_blocked')
    expect(mapped.reasons).toEqual(['tiene 3 producto(s)', 'tiene 1 subcategoría(s)'])
    expect(mapped.message).toContain('tiene 3 producto(s); tiene 1 subcategoría(s)')
  })

  it('maps impact confirmations, including option changes with stored values', () => {
    const impact = mapMasterError(http(409, { code: 'IMPACT_CONFIRMATION_REQUIRED', message: 'Confirma', impact: { products: 4 } }))
    expect(impact).toMatchObject({ kind: 'impact', impact: { products: 4 } })
    const options = mapMasterError(http(409, { code: 'option_change_with_values', details: { selections: 7, optionKeys: ['a'] } }))
    expect(options.kind).toBe('impact')
    expect(impactLines(options.impact)).toEqual(['7 producto(s) ya eligieron estas opciones'])
  })

  it('shows a friendly notice for dedicated-mode 503', () => {
    const mapped = mapMasterError(http(503, { code: 'SUBCATEGORY_UNSUPPORTED', message: 'Este almacén de biblioteca aún no admite subcategorías.' }))
    expect(mapped.kind).toBe('unsupported')
    expect(mapped.message).toContain('todavía no maneja subcategorías')
  })

  it('falls back to a neutral message', () => {
    expect(mapMasterError(new Error('boom')).message).toBe('No se pudo completar la operación. Intenta de nuevo.')
    expect(mapMasterError(http(403, {})).kind).toBe('forbidden')
  })
})

describe('impact helpers', () => {
  it('words a parent change with names, never ids', () => {
    const lines = impactLines({ products: 2, templateEntries: 5, fromCategoryId: 'id-a', toCategoryId: 'id-b' }, (id) => ({ 'id-a': 'Video', 'id-b': 'Acceso' })[id])
    expect(lines).toEqual(['2 producto(s)', '5 dato(s) en su molde', 'Cambia de categoría padre: de «Video» a «Acceso»'])
    expect(lines.join(' ')).not.toMatch(/id-[ab]/)
  })

  it('words a currency change with prices', () => {
    expect(impactLines({ priceCount: 12, fromCurrency: 'COP', toCurrency: 'USD' })).toEqual(['12 precio(s)', 'Cambia la moneda de COP a USD'])
  })

  it('retries with confirmImpact only after an explicit yes', async () => {
    const attempt = vi.fn(async (confirm: boolean) => {
      if (!confirm) throw http(409, { code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { products: 1 } })
      return 'ok'
    })
    const yes = await runWithImpactConfirmation(attempt, () => true)
    expect(yes).toEqual({ confirmed: true, value: 'ok' })
    expect(attempt.mock.calls.map((call) => call[0])).toEqual([false, true])

    attempt.mockClear()
    const no = await runWithImpactConfirmation(attempt, () => false)
    expect(no).toEqual({ cancelled: true })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('rethrows errors that are not impact confirmations', async () => {
    const failure = http(409, { code: 'NAME_DUPLICATED', existing: { name: 'A' } })
    await expect(runWithImpactConfirmation(async () => { throw failure }, () => true)).rejects.toBe(failure)
  })
})

describe('usage and search helpers', () => {
  it('summarises deletability and blockers', () => {
    const summary = usageSummary({ counts: { products: 2, children: 0 }, canDelete: false, reasons: [{ message: 'tiene 2 producto(s)' }] })
    expect(summary).toEqual({ canDelete: false, lines: ['2 producto(s)'], blockers: ['tiene 2 producto(s)'] })
  })

  it('searches ignoring case and accents and builds slugs', () => {
    expect(matchesQuery('camara', 'Cámaras IP')).toBe(true)
    expect(matchesQuery('xyz', 'Cámaras IP', 'domos')).toBe(false)
    expect(slugify('Cámaras IP / Domo')).toBe('camaras-ip-domo')
  })

  it('derives dictionary keys and sends only changed options', () => {
    expect(snakeKey('Tipo de lente')).toBe('tipo_de_lente')
    expect(snakeKey('4K')).toBe('o_4k')
    const original = [{ key: 'fija', label: 'Fija', isActive: true }, { key: 'varifocal', label: 'Varifocal', isActive: true }]
    const rows = [{ ...original[0]! }, { key: 'varifocal', label: 'Varifocal motorizado', isActive: false }]
    expect(buildOptionsPayload({ rows, original, newLines: 'Ojo de pez\nFija\n\n' })).toEqual([
      { key: 'varifocal', label: 'Varifocal motorizado', isActive: false },
      { key: 'ojo_de_pez', label: 'Ojo de pez' },
    ])
  })

  it('approval is never implied: only with the approve grant and a proposed row', () => {
    expect(canShowApproveButton(false, 'PROPOSED')).toBe(false)
    expect(canShowApproveButton(true, 'APPROVED')).toBe(false)
    expect(canShowApproveButton(true, 'PROPOSED')).toBe(true)
  })
})
