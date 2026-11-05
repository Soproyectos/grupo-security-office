import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MasterSectionView, type MasterSectionViewProps } from './MasterSection'
import { DefinitionsView, MoldsView, buildDefinitionUpdate, emptyDefinitionForm, formFromDefinition, validateDefinitionForm, type DefinitionsViewProps, type MoldsViewProps } from './DictionarySection'
import { buildCategoriesAdapter, buildSubcategoriesAdapter, tariffsAdapter } from './catalog-sections'
import { MasterSectionBody } from '../../pages/LibraryMastersPage'
import { TARIFF_CREATE_NOTICE } from './masters-rules'

const grants = vi.hoisted(() => ({ actions: [] as string[] }))
vi.mock('../users/access', () => ({ useHasAssignedAction: (actions: readonly string[]) => actions.some((action) => grants.actions.includes(action)) }))

const noop = () => undefined
const viewProps = (overrides: Partial<MasterSectionViewProps> = {}): MasterSectionViewProps => ({
  label: 'Marcas', singular: 'marca',
  rows: [
    { id: 'b1', name: 'Hikvision', detail: 'https://hik.example.invalid', active: true, counts: ['12 productos'] },
    { id: 'b2', name: 'Dahua', active: false, counts: [] },
  ],
  loading: false, loadError: null, query: '', onQuery: noop, canWrite: false,
  selectedId: 'b1', onSelect: noop,
  usage: { counts: { products: 12 }, canDelete: false, reasons: [{ message: 'tiene 12 producto(s)' }] }, usageLoading: false,
  form: null, formError: null, error: null, impact: null,
  onConfirmImpact: noop, onCancelImpact: noop, deleteTarget: null,
  onNew: noop, onEdit: noop, onToggleActive: noop, onAskDelete: noop, onConfirmDelete: noop, onCancelDelete: noop, busy: false,
  ...overrides,
})

describe('MasterSectionView', () => {
  it('read-only shows the list, counts and usage without any write control', () => {
    const html = renderToStaticMarkup(<MasterSectionView {...viewProps()} />)
    expect(html).toContain('Hikvision')
    expect(html).toContain('12 productos')
    expect(html).toContain('Inactiva')
    expect(html).toContain('tiene 12 producto(s)')
    expect(html).toContain('Solo consulta')
    for (const control of ['Nueva marca', '>Editar<', 'Desactivar', '>Eliminar<']) expect(html).not.toContain(control)
  })

  it('with write grant shows create/edit/toggle and disables delete when the record is in use', () => {
    const html = renderToStaticMarkup(<MasterSectionView {...viewProps({ canWrite: true })} />)
    expect(html).toContain('Nueva marca')
    expect(html).toContain('>Editar<')
    expect(html).toContain('>Desactivar<')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Eliminar<\/button>/)
    expect(html).toContain('Puedes desactivarlo')
  })

  it('enables delete and asks for confirmation when nothing uses the record', () => {
    const usage = { counts: {}, canDelete: true, reasons: [] }
    const free = renderToStaticMarkup(<MasterSectionView {...viewProps({ canWrite: true, usage })} />)
    expect(free).not.toMatch(/<button[^>]*disabled=""[^>]*>Eliminar<\/button>/)
    expect(free).toContain('Se puede eliminar')
    const asking = renderToStaticMarkup(<MasterSectionView {...viewProps({ canWrite: true, usage, deleteTarget: 'b1' })} />)
    expect(asking).toContain('¿Eliminar «Hikvision»?')
  })

  it('never renders internal ids', () => {
    expect(renderToStaticMarkup(<MasterSectionView {...viewProps({ canWrite: true })} />)).not.toMatch(/\bb1\b|\bb2\b/)
  })

  it('shows the duplicate, unsupported and impact messages', () => {
    const duplicate = renderToStaticMarkup(<MasterSectionView {...viewProps({ error: { kind: 'duplicate', message: 'Ya existe un registro equivalente: «Dahua». Usa ese o cambia el nombre.' } })} />)
    expect(duplicate).toContain('«Dahua»')
    const unsupported = renderToStaticMarkup(<MasterSectionView {...viewProps({ error: { kind: 'unsupported', message: 'Este almacén de biblioteca todavía no maneja subcategorías.' } })} />)
    expect(unsupported).toContain('role="status"')
    const impact = renderToStaticMarkup(<MasterSectionView {...viewProps({ canWrite: true, impact: { error: { kind: 'impact', message: 'Revisa el impacto.' }, lines: ['3 producto(s)'] } })} />)
    expect(impact).toContain('Sí, aplicar el cambio')
    expect(impact).toContain('3 producto(s)')
  })

  it('tariff create form states that it does not load prices or assign customers', () => {
    const html = renderToStaticMarkup(<MasterSectionView {...viewProps({ canWrite: true, form: { mode: 'create', fields: tariffsAdapter.fields(null), values: tariffsAdapter.initialValues(null), note: tariffsAdapter.createNote, busy: false, onChange: noop, onSubmit: noop, onCancel: noop } })} />)
    expect(html).toContain(TARIFF_CREATE_NOTICE)
    expect(TARIFF_CREATE_NOTICE).toContain('No carga precios ni la asigna a clientes')
  })
})

describe('adapters', () => {
  const categories = [
    { id: 'r1', name: 'Video', slug: 'video', description: null, parentId: null, sortOrder: 0, isActive: true, productCount: 4, childrenCount: 1, createdAt: '', updatedAt: '' },
    { id: 'r2', name: 'Acceso', slug: 'acceso', description: null, parentId: null, sortOrder: 1, isActive: true, createdAt: '', updatedAt: '' },
  ]

  it('category rows show counts and the parent change impact uses names', () => {
    const adapter = buildCategoriesAdapter(categories)
    expect(adapter.toRow(categories[0]!).counts).toEqual(['4 productos', '1 categoría hija'])
    expect(adapter.resolveName?.('r2')).toBe('Acceso')
  })

  it('subcategory form offers only root categories and rows name the parent', () => {
    const adapter = buildSubcategoriesAdapter([...categories, { ...categories[0]!, id: 'h1', name: 'Hija', parentId: 'r1' }])
    const select = adapter.fields(null).find((field) => field.name === 'categoryId')
    expect(select?.options?.map((option) => option.label)).toEqual(['Video', 'Acceso'])
    const row = adapter.toRow({ id: 's1', categoryId: 'r1', name: 'Domos', slug: 'domos', isActive: true, productCount: 2, category: { id: 'r1', name: 'Video' } })
    expect(row.detail).toBe('Dentro de «Video»')
  })

  it('validates required names and tariff codes', () => {
    expect(tariffsAdapter.validate({ name: 'A', code: 'ORO', currency: 'COP' })).toMatch(/nombre/)
    expect(tariffsAdapter.validate({ name: 'Oro', code: '', currency: 'COP' })).toMatch(/código/)
    expect(tariffsAdapter.validate({ name: 'Oro', code: 'ORO', currency: 'COP' })).toBeNull()
  })
})

const definition = { id: 'd1', key: 'resolucion', label: 'Resolución', dataType: 'OPTION' as const, unit: null, isActive: true, options: [{ key: 'hd', label: 'HD', isActive: true }, { key: 'uhd', label: '4K', isActive: false }] }
const defProps = (overrides: Partial<DefinitionsViewProps> = {}): DefinitionsViewProps => ({
  rows: [definition], loading: false, query: '', onQuery: noop, canWrite: false, selectedKey: 'resolucion', onSelect: noop,
  usage: { counts: { templateEntries: 3, productValues: 10 } }, usageLoading: false, form: null, onForm: noop, onSubmit: noop, onCancel: noop,
  onNew: noop, onEdit: noop, onToggleActive: noop, busy: false, error: null, formError: null, impact: null, onConfirmImpact: noop, onCancelImpact: noop,
  ...overrides,
})

describe('DefinitionsView', () => {
  it('read-only lists type, options and usage without write controls', () => {
    const html = renderToStaticMarkup(<DefinitionsView {...defProps()} />)
    expect(html).toContain('Una opción')
    expect(html).toContain('2 opción(es)')
    expect(html).toContain('3 dato(s) en su molde')
    expect(html).toContain('Solo consulta')
    expect(html).not.toContain('Nuevo dato')
    expect(html).not.toContain('>Editar<')
  })

  it('writer sees create/edit/toggle and the create form with options', () => {
    const html = renderToStaticMarkup(<DefinitionsView {...defProps({ canWrite: true, form: { ...emptyDefinitionForm(), dataType: 'OPTION' } })} />)
    expect(html).toContain('Nuevo dato')
    expect(html).toContain('>Desactivar<')
    expect(html).toContain('(una por línea)')
  })

  it('builds minimal updates and validates the create form', () => {
    const form = { ...formFromDefinition(definition), label: 'Resolución de video', isActive: false }
    expect(buildDefinitionUpdate(definition, form, true)).toEqual({ label: 'Resolución de video', isActive: false, confirmImpact: true })
    expect(validateDefinitionForm(emptyDefinitionForm())).toMatch(/nombre/)
    expect(validateDefinitionForm({ ...emptyDefinitionForm(), label: 'Tipo', dataType: 'OPTION' })).toMatch(/opción/)
    expect(validateDefinitionForm({ ...emptyDefinitionForm(), label: 'Tipo' })).toBeNull()
  })
})

const moldProps = (overrides: Partial<MoldsViewProps> = {}): MoldsViewProps => ({
  subcategories: [{ id: 's1', name: 'Domos', categoryName: 'Video' }], subcategoryId: 's1', onSubcategory: noop, loading: false,
  mold: { subcategoryId: 's1', entries: [
    { specKey: 'resolucion', label: 'Resolución', dataType: 'OPTION', unit: null, status: 'PROPOSED', isRequired: true, isFilterable: true, requiredReason: null, sortOrder: 1 },
    { specKey: 'lente', label: 'Lente', dataType: 'NUMBER', unit: 'mm', status: 'APPROVED', isRequired: false, isFilterable: false, requiredReason: null, sortOrder: 2 },
  ] },
  usage: { counts: { proposed: 1, approved: 1, retired: 0, products: 8, storedValues: 20 } },
  canApprove: false, approvingKey: null, onAskApprove: noop, reason: '', onReason: noop, onApprove: noop, busy: false, error: null,
  ...overrides,
})

describe('MoldsView', () => {
  it('shows required, filter flags and status read-only, no approve button without the approve grant', () => {
    const html = renderToStaticMarkup(<MoldsView {...moldProps()} />)
    expect(html).toContain('Propuesto')
    expect(html).toContain('Aprobado')
    expect(html).toContain('Sirve como filtro')
    expect(html).toContain('8 producto(s) lo usan')
    expect(html).not.toContain('>Aprobar<')
  })

  it('offers approval only with the approve grant and only for proposed rows', () => {
    const html = renderToStaticMarkup(<MoldsView {...moldProps({ canApprove: true })} />)
    expect(html.match(/>Aprobar</g)).toHaveLength(1)
    const confirm = renderToStaticMarkup(<MoldsView {...moldProps({ canApprove: true, approvingKey: 'resolucion' })} />)
    expect(confirm).toContain('Sí, aprobar')
  })
})

describe('LibraryMastersPage section body', () => {
  const render = (slug: string, canWrite: boolean) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return renderToStaticMarkup(
      <QueryClientProvider client={client}><MemoryRouter><MasterSectionBody slug={slug} canWrite={canWrite} /></MemoryRouter></QueryClientProvider>,
    )
  }

  it('renders each section with and without the write grant', () => {
    grants.actions = []
    for (const [slug, noun] of [['categorias', 'categorías'], ['subcategorias', 'subcategorías'], ['marcas', 'marcas'], ['tarifas', 'tarifas']] as const) {
      const readOnly = render(slug, false)
      expect(readOnly).toContain(`Buscar ${noun}`)
      expect(readOnly).not.toMatch(/>Nueva /)
      expect(render(slug, true)).toMatch(/>Nueva (categoría|subcategoría|marca|tarifa)</)
    }
    const dictionary = render('diccionario', false)
    expect(dictionary).toContain('Diccionario de datos')
    expect(dictionary).toContain('Moldes por subcategoría')
    expect(dictionary).not.toContain('Nuevo dato')
    expect(render('diccionario', true)).toContain('Nuevo dato')
  })
})
