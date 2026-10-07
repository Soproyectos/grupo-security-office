import { describe, expect, it } from 'vitest'
import {
  actionVerb,
  actorLabel,
  buildChanges,
  describeAuditEntry,
  fieldLabel,
  formatAuditDate,
  formatAuditValue,
  isHiddenKey,
} from './audit-format'

const UUID = '69ba44ee-7081-475b-8f00-b3220364bee5'

describe('actorLabel', () => {
  it('uses the display name resolved by the server', () => {
    expect(actorLabel({ userId: UUID, actorName: ' María Gómez ' })).toBe('María Gómez')
  })

  it('falls back to the legacy user.name', () => {
    expect(actorLabel({ userId: UUID, user: { name: 'Pedro Ruiz' } })).toBe('Pedro Ruiz')
  })

  it('says "Usuario eliminado" when there is a user id but no name', () => {
    expect(actorLabel({ userId: UUID, actorName: null })).toBe('Usuario eliminado')
  })

  it('says "Sistema" when there is no actor', () => {
    expect(actorLabel({ userId: null, actorName: null })).toBe('Sistema')
    expect(actorLabel({})).toBe('Sistema')
  })

  it('never returns an id', () => {
    expect(actorLabel({ userId: UUID, actorName: null })).not.toContain(UUID)
  })
})

describe('actionVerb', () => {
  it('maps known actions to Spanish verbs', () => {
    expect(actionVerb('update_sheet')).toBe('actualizó la ficha del producto')
    expect(actionVerb('create')).toBe('creó el producto')
    expect(actionVerb('delete')).toBe('eliminó el producto')
    expect(actionVerb('publish')).toContain('publicó')
    expect(actionVerb('archive')).toContain('archivó')
    expect(actionVerb('restore')).toContain('restauró')
    expect(actionVerb('schedule_publish')).toContain('programó')
  })

  it('is case-insensitive (importer stores IMPORT_PRODUCTS)', () => {
    expect(actionVerb('IMPORT_PRODUCTS')).toContain('importación')
  })

  it('uses a readable generic fallback and never the raw code', () => {
    const verb = actionVerb('some_new_action')
    expect(verb).toBe('registró un cambio en el producto')
    expect(verb).not.toContain('some_new_action')
    expect(actionVerb(undefined)).toBe('registró un cambio en el producto')
  })
})

describe('formatAuditValue', () => {
  it('formats booleans as Sí/No', () => {
    expect(formatAuditValue('isVisible', true)).toBe('Sí')
    expect(formatAuditValue('isVisible', false)).toBe('No')
  })

  it('formats empty values', () => {
    expect(formatAuditValue('name', null)).toBe('vacío')
    expect(formatAuditValue('name', '  ')).toBe('vacío')
  })

  it('formats money keys as currency', () => {
    expect(formatAuditValue('price', 150000)).toMatch(/150\.000/)
    expect(formatAuditValue('price', '2500')).toMatch(/2\.500/)
  })

  it('formats ISO dates readably', () => {
    const text = formatAuditValue('publishAt', '2026-10-02T15:15:00.000Z')
    expect(text).not.toContain('T15')
    expect(text).toMatch(/2026/)
  })

  it('summarizes arrays and objects', () => {
    expect(formatAuditValue('highlights', ['a', 'b', 'c'])).toBe('3 elementos')
    expect(formatAuditValue('highlights', ['a'])).toBe('1 elemento')
    expect(formatAuditValue('highlights', [])).toBe('ninguno')
    expect(formatAuditValue('technicalSpecs', { a: 1, b: 2 })).toBe('2 datos')
  })

  it('translates known enum values', () => {
    expect(formatAuditValue('lifecycleStatus', 'PUBLISHED')).toBe('Publicado')
    expect(formatAuditValue('status', 'DISCONTINUED')).toBe('Descontinuado')
  })

  it('truncates very long text', () => {
    const text = formatAuditValue('description', 'x'.repeat(500))
    expect(text.length).toBeLessThanOrEqual(120)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('field labels and hidden keys', () => {
  it('translates known keys', () => {
    expect(fieldLabel('name')).toBe('Nombre')
    expect(fieldLabel('catalogHighlights')).toBe('Destacados')
    expect(fieldLabel('isVisible')).toBe('Visible en la tienda')
    expect(fieldLabel('price')).toBe('Precio')
  })

  it('uses sheet-specific labels for update_sheet', () => {
    expect(fieldLabel('name', 'update_sheet')).toBe('Nombre de la ficha')
    expect(fieldLabel('name', 'update')).toBe('Nombre')
  })

  it('humanizes unknown keys instead of showing camelCase', () => {
    expect(fieldLabel('someNewField')).toBe('Some new field')
  })

  it('hides ids and internal keys', () => {
    for (const key of ['id', 'productId', 'listaId', 'categoryId', 'createdAt', 'updatedAt', 'uid']) {
      expect(isHiddenKey(key)).toBe(true)
    }
    for (const key of ['name', 'sku', 'isVisible', 'slug']) {
      expect(isHiddenKey(key)).toBe(false)
    }
  })
})

describe('buildChanges', () => {
  it('lists only the fields that changed, with old and new values', () => {
    const rows = buildChanges(
      { name: 'DVR 4', isVisible: false, sku: 'X' },
      { name: 'DVR 4 canales', isVisible: true, sku: 'X' },
    )
    expect(rows.map((r) => r.key)).toEqual(['name', 'isVisible'])
    expect(rows[0]).toMatchObject({ label: 'Nombre', kind: 'changed', before: 'DVR 4', after: 'DVR 4 canales' })
    expect(rows[1]).toMatchObject({ label: 'Visible en la tienda', before: 'No', after: 'Sí' })
  })

  it('hides ids, timestamps and UUID values', () => {
    const rows = buildChanges(
      { id: UUID, productId: UUID, updatedAt: '2026-01-01T00:00:00Z', name: 'A' },
      { id: UUID, productId: 'other', updatedAt: '2026-01-02T00:00:00Z', name: 'B', ref: UUID },
    )
    expect(rows.map((r) => r.key)).toEqual(['name'])
    expect(JSON.stringify(rows)).not.toContain(UUID)
  })

  it('compares arrays deeply and flags same-size lists with different content', () => {
    const rows = buildChanges(
      { highlights: ['a', 'b'] },
      { highlights: ['a', 'c'] },
      'update_sheet',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      label: 'Destacados',
      before: '2 elementos',
      after: '2 elementos (con cambios)',
    })
  })

  it('ignores keys that only exist in the old snapshot (partial writes)', () => {
    const rows = buildChanges({ lifecycleStatus: 'DRAFT', isActive: false }, { lifecycleStatus: 'PUBLISHED' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Estado en la tienda', before: 'Borrador', after: 'Publicado' })
  })

  it('shows the written values on creation and the removed ones on deletion', () => {
    const created = buildChanges(null, { sku: 'IDS-1', name: 'DVR', description: null })
    expect(created.map((r) => r.key)).toEqual(['sku', 'name'])
    expect(created.every((r) => r.kind === 'set' && r.before === null)).toBe(true)

    const deleted = buildChanges({ sku: 'IDS-1', isActive: true }, null)
    expect(deleted.every((r) => r.kind === 'removed' && r.after === null)).toBe(true)
    expect(deleted.find((r) => r.key === 'isActive')?.before).toBe('Sí')
  })

  it('returns nothing when there is no data', () => {
    expect(buildChanges(null, null)).toEqual([])
    expect(buildChanges(undefined, undefined)).toEqual([])
  })

  it('marks values that were filled or cleared', () => {
    const rows = buildChanges({ description: null, slug: 'a' }, { description: 'Nueva', slug: null })
    expect(rows.find((r) => r.key === 'description')?.kind).toBe('set')
    expect(rows.find((r) => r.key === 'slug')?.kind).toBe('removed')
  })
})

describe('formatAuditDate', () => {
  it('is readable and tolerant of bad input', () => {
    expect(formatAuditDate('2026-10-02T20:15:00.000Z')).toMatch(/2026/)
    expect(formatAuditDate('not-a-date')).toBe('fecha desconocida')
    expect(formatAuditDate(null)).toBe('fecha desconocida')
  })
})

describe('describeAuditEntry', () => {
  it('builds a Spanish sentence with the actor name', () => {
    const view = describeAuditEntry({
      action: 'update_sheet',
      userId: UUID,
      actorName: 'María Gómez',
      oldValues: { highlights: ['a'] },
      newValues: { highlights: ['a', 'b'] },
      createdAt: '2026-10-02T20:15:00.000Z',
    })
    expect(view.sentence).toBe('María Gómez actualizó la ficha del producto')
    expect(view.changes).toHaveLength(1)
    expect(view.when).toMatch(/2026/)
    expect(JSON.stringify(view)).not.toContain(UUID)
  })

  it('handles system and deleted users', () => {
    const base = { action: 'publish', createdAt: '2026-10-02T20:15:00.000Z' }
    expect(describeAuditEntry({ ...base, userId: null }).sentence).toMatch(/^Sistema /)
    expect(describeAuditEntry({ ...base, userId: UUID }).sentence).toMatch(/^Usuario eliminado /)
  })

  it('never exposes the raw action code for unknown actions', () => {
    const view = describeAuditEntry({ action: 'zzz_unknown', userId: null, createdAt: '2026-10-02T20:15:00.000Z' })
    expect(view.sentence).not.toContain('zzz_unknown')
  })
})
