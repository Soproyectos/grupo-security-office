import { describe, expect, it } from 'vitest'
import { sheetFixture } from './fixtures'
import {
  appendItem,
  detectVersionConflict,
  LIMITS,
  moveItem,
  moveWithinGroup,
  newFeature,
  newResource,
  newSpecGroup,
  newSpecItem,
  newTextRow,
  removeAt,
  replaceAt,
  savePayloadWithVersion,
  sectionOfKind,
  snapshot,
  toForm,
  toPayload,
  validateForm,
  versionConflictMessage,
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

describe('CAT-03 · identificadores del fabricante (H4)', () => {
  it('round-trips manufacturerRefs through form and payload', () => {
    const sheet = sheetFixture()
    const form = toForm(sheet)
    expect(form.manufacturerRefs.map((r) => r.value)).toEqual(['DS-E04HQHI-D/PN', '7798123456789'])

    const payload = toPayload(form)
    expect(payload.manufacturerRefs).toEqual(['DS-E04HQHI-D/PN', '7798123456789'])
  })

  it('trims and drops blank rows', () => {
    const form = toForm(sheetFixture({ manufacturerRefs: [] }))
    form.manufacturerRefs = [newTextRow('  PN-1  '), newTextRow(''), newTextRow('   ')]
    expect(toPayload(form).manufacturerRefs).toEqual(['PN-1'])
  })

  it('validates count and length limits', () => {
    const form = toForm(sheetFixture({ manufacturerRefs: [] }))
    form.manufacturerRefs = Array.from({ length: LIMITS.manufacturerRefs + 1 }, (_, i) => newTextRow(`PN-${i}`))
    expect(validateForm(form).manufacturerRefs).toMatch(/Máximo/)

    form.manufacturerRefs = [newTextRow('X'.repeat(LIMITS.manufacturerRefLength + 1))]
    expect(validateForm(form)['manufacturerRefs.0']).toMatch(/caracteres/)

    form.manufacturerRefs = [newTextRow('PN-OK')]
    expect(validateForm(form).manufacturerRefs).toBeUndefined()
  })

  it('con permiso las notas viajan en el payload; sin permiso se OMITEN (el servidor las conserva)', () => {
    // Con `canSeeInternalNotes: true` (fixture) el editor de Notas manda el
    // texto (y vacío = null explícito para borrarlas).
    const visible = toPayload(toForm(sheetFixture()))
    expect(visible.internalNotes).toBe('Almacén Bodega 2: último lote sin garantía extendida.')
    const cleared = toPayload({ ...toForm(sheetFixture()), internalNotes: '   ' })
    expect(cleared.internalNotes).toBeNull()

    // Sin permiso: `toForm` deja `internalNotes` en null y el payload OMITE la
    // clave — undefined no viaja en JSON y el servidor conserva lo vigente.
    const hiddenForm = toForm(sheetFixture({ canSeeInternalNotes: false, internalNotes: null }))
    expect(hiddenForm.internalNotes).toBeNull()
    const hidden = toPayload(hiddenForm)
    expect('internalNotes' in hidden).toBe(false)
    expect(JSON.parse(JSON.stringify(hidden))).not.toHaveProperty('internalNotes')
  })

  it('valida la longitud de las notas internas (espejo del DTO: 4000)', () => {
    const form = toForm(sheetFixture())
    form.internalNotes = 'x'.repeat(LIMITS.internalNotes + 1)
    expect(validateForm(form).internalNotes).toMatch(/Máximo/)
    form.internalNotes = 'nota corta'
    expect(validateForm(form).internalNotes).toBeUndefined()
    // Sin permiso no se valida (el campo ni existe en la UI).
    form.internalNotes = null
    expect(validateForm(form).internalNotes).toBeUndefined()
  })
})

describe('CAT-03 · OCC del editor de ficha (H2)', () => {
  it('savePayloadWithVersion envía la versión que el cliente leyó', () => {
    const sheet = sheetFixture({ version: 7 })
    const payload = savePayloadWithVersion(toForm(sheet), sheet)
    expect(payload.expectedVersion).toBe(7)
    expect(payload.manufacturerRefs).toEqual(sheet.manufacturerRefs)
  })

  const httpError = (status: number, data: unknown) => ({ response: { status, data } })

  it('detectVersionConflict reconoce el 409 de ficha por feedback y extrae la versión', () => {
    const conflict = detectVersionConflict(
      httpError(409, {
        message: 'La ficha cambió (versión vigente 9). Revisa la versión nueva antes de volver a guardar.',
        feedback: ['sheet-version-conflict: la versión vigente de la ficha es 9'],
      }),
    )
    expect(conflict).toEqual({ currentVersion: 9 })
    expect(versionConflictMessage(conflict!)).toContain('versión vigente 9')
  })

  it('detecta también el 409 de ficha si solo llega el message', () => {
    const conflict = detectVersionConflict(httpError(409, { message: 'La ficha cambió (versión vigente 3).' }))
    expect(conflict).toEqual({ currentVersion: 3 })
  })

  it('un 409 de OTRO conflicto (slug, revisión) no es conflicto de versión', () => {
    expect(detectVersionConflict(httpError(409, { message: 'Ya existe otro producto con ese slug' }))).toBeNull()
    expect(
      detectVersionConflict(
        httpError(409, { message: 'La revisión cambió (última versión 2).', feedback: ['revision-version-conflict: versión vigente 2'] }),
      ),
    ).toBeNull()
  })

  it('otros estados y errores de red no son conflicto de versión', () => {
    expect(detectVersionConflict(httpError(400, { message: 'Slug inválido' }))).toBeNull()
    expect(detectVersionConflict(httpError(403, { message: 'Sin permiso products:write' }))).toBeNull()
    expect(detectVersionConflict(new Error('network'))).toBeNull()
    expect(detectVersionConflict(undefined)).toBeNull()
  })

  it('si el cuerpo no trae el número, el mensaje sigue siendo útil (sin falso éxito)', () => {
    const conflict = detectVersionConflict(httpError(409, { message: 'La ficha cambió' }))
    expect(conflict).toEqual({ currentVersion: null })
    expect(versionConflictMessage(conflict!)).toContain('NO se guardaron')
  })
})

describe('CAT-03 · frontend-tecnicos (sin PDF obligatorio)', () => {
  it('publicar SIN documentos ni ficha técnica NO produce errores', () => {
    const form = toForm(sheetFixture({ resources: [], specGroups: [] }))
    form.published = true
    form.slug = 'sin-datos'
    expect(validateForm(form)).toEqual({})
  })

  it('la única exigencia al publicar sigue siendo el slug', () => {
    const form = toForm(sheetFixture({ resources: [] }))
    form.published = true
    form.slug = ''
    expect(validateForm(form).slug).toMatch(/slug/)
    expect(Object.keys(validateForm(form))).toEqual(['slug'])
  })
})
