/**
 * CAT-05 `backend-reglas` — reglas v1 del motor puro. Cubre los casos de la
 * ficha: imagen/precio inválidos bloquean según contrato; PDF ausente no
 * bloquea (y ninguna regla —ni de categoría— puede convertirlo en bloqueo);
 * stock y canal quedan fuera del bloqueo (decisiones externas).
 */
import {
  CATEGORY_RULES,
  RULES_VERSION,
  isStaleReport,
  runValidation,
  type ProductValidationInput,
  type ValidationIssue,
} from './validation-rules'

const input = (over: Partial<ProductValidationInput> = {}): ProductValidationInput => ({
  productId: 'p-1',
  revisionId: 'rev-1',
  name: 'Cámara Domo 4K',
  catalogName: null,
  brandId: 'b-1',
  catalogBrand: null,
  categoryActive: true,
  categorySlug: null,
  images: [{ url: '/api/files/img-1', isPrimary: true }],
  resources: [{ kind: 'DATASHEET', url: '/api/files/doc-1', requiresLicense: false }],
  files: {
    'img-1': { exists: true, detectedKind: 'IMAGE' },
    'doc-1': { exists: true, detectedKind: 'PDF' },
  },
  lista: null,
  prices: [],
  expectsPublication: false,
  stockZero: false,
  ...over,
})

const codesOf = (issues: ValidationIssue[]) => issues.map((i) => i.code)

describe('runValidation — reglas v1 (cat05-r1)', () => {
  it('producto sano en borrador: sin errores y LISTA_PARA_PUBLICAR', () => {
    const r = runValidation(input())
    expect(r.rulesVersion).toBe(RULES_VERSION)
    expect(r.status).toBe('LISTA_PARA_PUBLICAR')
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('nombre provisional o vacío → error base.name_useful (usa catalogName si existe)', () => {
    expect(codesOf(runValidation(input({ name: 'TBD' })).issues)).toContain('base.name_useful')
    expect(codesOf(runValidation(input({ name: '   ' })).issues)).toContain('base.name_useful')
    // con ficha nombrada aunque el producto no: ok
    expect(codesOf(runValidation(input({ name: '', catalogName: 'DVR real' })).issues)).not.toContain('base.name_useful')
  })

  it('marca ausente y catálogo con «Sin marca» → error; marca de ficha presente → ok', () => {
    expect(codesOf(runValidation(input({ brandId: null, catalogBrand: 'sin marca' })).issues)).toContain('base.brand_present')
    expect(codesOf(runValidation(input({ brandId: null, catalogBrand: 'Hikvision' })).issues)).not.toContain('base.brand_present')
  })

  it('categoría inactiva → error base.category_valid', () => {
    expect(codesOf(runValidation(input({ categoryActive: false })).issues)).toContain('base.category_valid')
  })

  it('sin imagen principal → error media.primary_image', () => {
    expect(codesOf(runValidation(input({ images: [] })).issues)).toContain('media.primary_image')
    expect(codesOf(runValidation(input({ images: [{ url: '/api/files/a', isPrimary: false }] })).issues)).toContain('media.primary_image')
  })

  it('URL escrita que no demuestra existencia: archivo ausente → error; tipo real distinto → error', () => {
    expect(codesOf(runValidation(input({ files: {} })).issues)).toContain('media.file_exists')
    expect(codesOf(runValidation(input({ files: { 'img-1': { exists: false, detectedKind: null }, 'doc-1': { exists: true, detectedKind: 'PDF' } } })).issues)).toContain('media.file_exists')
    expect(codesOf(runValidation(input({ files: { 'img-1': { exists: true, detectedKind: 'PDF' }, 'doc-1': { exists: true, detectedKind: 'PDF' } } })).issues)).toContain('media.file_exists')
  })

  it('enlace EXTERNO solo genera warning (no se descargan URLs arbitrarias — límite del diseño)', () => {
    const r = runValidation(input({ images: [{ url: 'https://ex.test/a.jpg', isPrimary: true }], resources: [] }))
    expect(codesOf(r.issues)).toContain('media.external_unverified')
    expect(r.issues.find((i) => i.code === 'media.external_unverified')?.severity).toBe('warning')
  })

  it('PDF ausente = SIEMPRE warning informativo: nunca bloquea (regla 2 de la ficha)', () => {
    const r = runValidation(input({ resources: [] }))
    const datasheet = r.issues.find((i) => i.code === 'docs.datasheet_missing')
    expect(datasheet).toBeDefined()
    expect(datasheet?.severity).toBe('warning')
    expect(r.status).toBe('LISTA_PARA_PUBLICAR')
  })

  it('CLAMP duro: una regla de categoría que intente volver error el PDF se degrada a warning', () => {
    CATEGORY_RULES['clamp-test'] = [
      () => [{ code: 'docs.datasheet_missing', severity: 'error', section: 'documentos', message: 'intento', fix: 'nada' }],
    ]
    try {
      const r = runValidation(input({ categorySlug: 'clamp-test' }))
      expect(r.issues.find((i) => i.code === 'docs.datasheet_missing')?.severity).toBe('warning')
    } finally {
      delete CATEGORY_RULES['clamp-test']
    }
  })

  it('oferta publicada: sin lista vigente o sin precio válido → errores CON_PROBLEMAS', () => {
    const r = runValidation(input({ expectsPublication: true, lista: null, prices: [] }))
    expect(codesOf(r.issues)).toContain('offer.lista_valid')
    expect(codesOf(r.issues)).toContain('offer.price_valid')
    expect(r.status).toBe('CON_PROBLEMAS')
    const bad = runValidation(input({ expectsPublication: true, lista: { isActive: false, archived: false, pendingDeletion: false, expired: false }, prices: [{ valueOk: true, expired: true }] }))
    expect(codesOf(bad.issues)).toContain('offer.lista_valid')
    expect(codesOf(bad.issues)).toContain('offer.price_valid')
  })

  it('oferta OK: lista activa y precio vigente → sin errores de oferta', () => {
    const r = runValidation(input({ expectsPublication: true, lista: { isActive: true, archived: false, pendingDeletion: false, expired: false }, prices: [{ valueOk: true, expired: false }] }))
    expect(r.issues.filter((i) => i.code.startsWith('offer.') && i.severity === 'error')).toEqual([])
    expect(r.status).toBe('LISTA_PARA_PUBLICAR')
  })

  it('en borrador, lista inválida es warning (no bloquea editar en privado)', () => {
    const r = runValidation(input({ lista: { isActive: false, archived: true, pendingDeletion: false, expired: false } }))
    expect(r.issues.find((i) => i.code === 'offer.lista_valid')?.severity).toBe('warning')
    expect(r.status).toBe('LISTA_PARA_PUBLICAR')
  })

  it('stock cero = info que no bloquea (política pendiente) y el hook de categoría vacío no añade nada', () => {
    const r = runValidation(input({ stockZero: true }))
    const stock = r.issues.find((i) => i.code === 'stock.zero_info')
    expect(stock?.severity).toBe('info')
    expect(r.status).toBe('LISTA_PARA_PUBLICAR')
    expect(Object.keys(CATEGORY_RULES)).toEqual([])
  })

  it('cada incidendia trae campo/código/severidad/sección/solución (formato de la ficha)', () => {
    const r = runValidation(input({ name: 's/d' }))
    const i = r.issues.find((x) => x.code === 'base.name_useful')!
    expect(i).toMatchObject({ field: 'name', section: 'identidad' })
    expect(typeof i.message).toBe('string')
    expect(typeof i.fix).toBe('string')
  })
})

describe('isStaleReport (V2: editar/reglas invalidan el resultado)', () => {
  const cur = { rulesVersion: RULES_VERSION, currentRevisionId: 'rev-1' }
  it('sin informe o sin rulesVersion → obsoleto', () => {
    expect(isStaleReport(null, cur)).toBe(true)
    expect(isStaleReport({ rulesVersion: null, revisionId: 'rev-1' }, cur)).toBe(true)
  })
  it('rulesVersion distinta → obsoleto (cambiar una regla marca pendientes)', () => {
    expect(isStaleReport({ rulesVersion: 'cat05-r0', revisionId: 'rev-1' }, cur)).toBe(true)
  })
  it('revisión de trabajo distinta (editar) o ausente → obsoleto', () => {
    expect(isStaleReport({ rulesVersion: RULES_VERSION, revisionId: 'rev-2' }, cur)).toBe(true)
    expect(isStaleReport({ rulesVersion: RULES_VERSION, revisionId: 'rev-1' }, { ...cur, currentRevisionId: null })).toBe(true)
  })
  it('mismo revision id y misma versión de reglas → vigente', () => {
    expect(isStaleReport({ rulesVersion: RULES_VERSION, revisionId: 'rev-1' }, cur)).toBe(false)
  })
})
