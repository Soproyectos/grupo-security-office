import { describe, expect, it } from 'vitest'
import { sheetFixture } from './fixtures'
import {
  appendItem,
  moveItem,
  moveWithinGroup,
  newFeature,
  newResource,
  newSpecGroup,
  newSpecItem,
  newTextRow,
  removeAt,
  replaceAt,
  sectionOfKind,
  snapshot,
  toForm,
  toPayload,
  validateForm,
} from './sheet-form'

describe('toForm / toPayload', () => {
  it('round-trips an existing sheet without losing ids, keys or order', () => {
    const sheet = sheetFixture()
    const payload = toPayload(toForm(sheet))

    expect(payload.name).toBe('DVR AcuSense de 4 canales')
    expect(payload.slug).toBe('ids-e04hqhi-d')
    expect(payload.features).toEqual([
      { id: 'acusense', label: 'AcuSense', icon: 'person' },
      { id: 'essd', label: 'eSSD 1 TB', icon: 'storage' },
    ])
    expect(payload.specGroups.map((g) => g.key)).toEqual(['video', 'red'])
    expect(payload.specGroups[0]?.items).toEqual([
      { label: 'Canales', value: '4' },
      { label: 'Resolución', value: '1080p' },
    ])
    expect(payload.resources.map((r) => [r.kind, r.requiresLicense, r.version])).toEqual([
      ['DATASHEET', false, null],
      ['FIRMWARE', true, 'V4.75.011'],
      ['MANUAL', false, null],
      ['RELEASE_NOTES', false, 'V4.75.011'],
    ])
  })

  it('sends blank text as null, drops blank list rows and trims values', () => {
    const form = toForm(sheetFixture())
    form.name = '   '
    form.slug = ''
    form.published = false
    form.badges = [newTextRow('  Nuevo '), newTextRow('   ')]
    form.highlights = [newTextRow(''), newTextRow(' Uno ')]
    form.resources = [{ ...newResource('documents'), title: ' Manual ', language: ' ES ', url: ' https://x.test/m.pdf ' }]

    const payload = toPayload(form)

    expect(payload.name).toBeNull()
    expect(payload.slug).toBeNull()
    expect(payload.badges).toEqual(['Nuevo'])
    expect(payload.highlights).toEqual(['Uno'])
    expect(payload.resources[0]).toMatchObject({ title: 'Manual', language: 'es', url: 'https://x.test/m.pdf', fileName: null, version: null, region: null })
  })

  it('omits id/key for new rows so the backend derives them', () => {
    const form = toForm(sheetFixture({ features: [], specGroups: [] }))
    form.features = [{ ...newFeature(), label: 'Nueva', icon: 'cloud' }]
    form.specGroups = [{ ...newSpecGroup(), title: 'Audio', items: [{ ...newSpecItem(), label: 'Entradas', value: '1' }] }]

    const payload = toPayload(form)

    expect(payload.features[0]).toEqual({ label: 'Nueva', icon: 'cloud' })
    expect(payload.specGroups[0]).toEqual({ title: 'Audio', items: [{ label: 'Entradas', value: '1' }] })
  })
})

describe('unsaved-changes snapshot', () => {
  it('is stable for an untouched form and changes after an edit', () => {
    const sheet = sheetFixture()
    expect(snapshot(toForm(sheet))).toBe(snapshot(toForm(sheet)))

    const edited = toForm(sheet)
    edited.specGroups = replaceAt(edited.specGroups, 0, { ...edited.specGroups[0]!, title: 'Video y audio' })
    expect(snapshot(edited)).not.toBe(snapshot(toForm(sheet)))
  })
})

describe('spec item add / remove / reorder', () => {
  it('adds, reorders and removes items inside a group', () => {
    const form = toForm(sheetFixture())
    const group = form.specGroups[0]!

    const added = { ...group, items: appendItem(group.items, { ...newSpecItem(), label: 'Audio', value: '1 canal' }) }
    expect(added.items.map((i) => i.label)).toEqual(['Canales', 'Resolución', 'Audio'])

    const moved = { ...added, items: moveItem(added.items, 2, -1) }
    expect(moved.items.map((i) => i.label)).toEqual(['Canales', 'Audio', 'Resolución'])

    const removed = { ...moved, items: removeAt(moved.items, 0) }
    expect(removed.items.map((i) => i.label)).toEqual(['Audio', 'Resolución'])

    form.specGroups = replaceAt(form.specGroups, 0, removed)
    expect(toPayload(form).specGroups[0]?.items).toEqual([
      { label: 'Audio', value: '1 canal' },
      { label: 'Resolución', value: '1080p' },
    ])
  })

  it('moveItem is a no-op at the edges', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, -1)).toBe(list)
    expect(moveItem(list, 2, 1)).toBe(list)
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b'])
  })

  it('reorders groups', () => {
    const form = toForm(sheetFixture())
    form.specGroups = moveItem(form.specGroups, 1, -1)
    expect(toPayload(form).specGroups.map((g) => g.title)).toEqual(['Red', 'Video'])
  })
})

describe('resources: documents and firmware share one ordered list', () => {
  const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind)

  it('classifies kinds into sections', () => {
    expect(sectionOfKind('DATASHEET')).toBe('documents')
    expect(sectionOfKind('CERTIFICATE')).toBe('documents')
    expect(sectionOfKind('FIRMWARE')).toBe('firmware')
    expect(sectionOfKind('RELEASE_NOTES')).toBe('firmware')
  })

  it('moves a document past the nearest document, skipping firmware rows in between', () => {
    const rows = toForm(sheetFixture()).resources // DATASHEET, FIRMWARE, MANUAL, RELEASE_NOTES
    const isDoc = (r: { kind: Parameters<typeof sectionOfKind>[0] }) => sectionOfKind(r.kind) === 'documents'

    const up = moveWithinGroup(rows, 2, -1, isDoc)
    expect(kinds(up)).toEqual(['MANUAL', 'DATASHEET', 'FIRMWARE', 'RELEASE_NOTES'])

    const down = moveWithinGroup(rows, 0, 1, isDoc)
    expect(kinds(down)).toEqual(['FIRMWARE', 'MANUAL', 'DATASHEET', 'RELEASE_NOTES'])

    // First/last of its section stay put.
    expect(moveWithinGroup(rows, 0, -1, isDoc)).toBe(rows)
    expect(moveWithinGroup(rows, 3, 1, isDoc)).toBe(rows)
  })

  it('new firmware rows default to FIRMWARE with license required; documents do not', () => {
    expect(newResource('firmware')).toMatchObject({ kind: 'FIRMWARE', requiresLicense: true })
    expect(newResource('documents')).toMatchObject({ kind: 'DATASHEET', requiresLicense: false })
  })
})

describe('validateForm', () => {
  it('accepts the fixture', () => {
    expect(validateForm(toForm(sheetFixture()))).toEqual({})
  })

  it('flags slug problems, including publishing without a slug', () => {
    const form = toForm(sheetFixture())
    form.slug = 'Slug Inválido'
    expect(validateForm(form).slug).toMatch(/minúsculas/)

    form.slug = '69ba44ee-7081-475b-8f00-b3220364bee5'
    expect(validateForm(form).slug).toMatch(/UUID/)

    form.slug = ''
    form.published = true
    expect(validateForm(form).slug).toMatch(/necesita un slug/)

    form.published = false
    expect(validateForm(form).slug).toBeUndefined()
  })

  it('flags blank feature text, spec labels/values/titles and bad resource fields by path', () => {
    const form = toForm(sheetFixture())
    form.features = [...form.features, { ...newFeature(), label: ' ' }]
    form.specGroups = [
      ...form.specGroups,
      { ...newSpecGroup(), title: '', items: [{ ...newSpecItem(), label: '', value: '' }] },
    ]
    form.resources = [{ ...newResource('documents'), title: '', url: 'javascript:alert(1)', language: 'español' }]

    const errors = validateForm(form)

    expect(errors['features.2.label']).toBeDefined()
    expect(errors['specGroups.2.title']).toBeDefined()
    expect(errors['specGroups.2.items.0.label']).toBeDefined()
    expect(errors['specGroups.2.items.0.value']).toBeDefined()
    expect(errors['resources.0.title']).toBeDefined()
    expect(errors['resources.0.url']).toMatch(/http/)
    expect(errors['resources.0.language']).toBeDefined()
  })

  it('accepts http(s) and /api/ urls, rejects relative paths elsewhere and a missing url', () => {
    const form = toForm(sheetFixture({ resources: [] }))
    const make = (url: string) => ({ ...newResource('documents'), title: 'T', url })
    form.resources = [make('https://a.test/x'), make('http://a.test/x'), make('/api/files/1')]
    expect(validateForm(form)).toEqual({})

    form.resources = [make('/etc/passwd'), make('//evil.test/x'), make('')]
    const errors = validateForm(form)
    expect(errors['resources.0.url']).toBeDefined()
    expect(errors['resources.1.url']).toBeDefined()
    expect(errors['resources.2.url']).toMatch(/Falta/)
  })

  it('validates the optional image url', () => {
    const form = toForm(sheetFixture())
    form.imageUrl = 'ftp://x'
    expect(validateForm(form).imageUrl).toBeDefined()
    form.imageUrl = ''
    expect(validateForm(form).imageUrl).toBeUndefined()
  })
})
