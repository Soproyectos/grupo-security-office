import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../products/types/product.types'
import type { ValidationIssueView, ValidationReportView } from '../catalog-validation/validation-model'
import { LibraryPublicationSection } from './LibraryPublicationSection'

const state = vi.hoisted(() => ({
  canPublish: true,
  priceWrites: 0,
  report: { data: undefined as unknown, isError: false, isPending: false },
  queryOptions: [] as { enabled?: boolean }[],
  mutation: {
    isPending: false, isError: false, error: null as unknown, variables: undefined as unknown,
    mutate: vi.fn(), reset: vi.fn(),
  },
  queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: (options: { enabled?: boolean }) => { state.queryOptions.push(options); return state.report },
    useMutation: () => state.mutation,
    useQueryClient: () => state.queryClient,
    useIsMutating: () => state.priceWrites,
  }
})
vi.mock('../../lib/rbac', () => ({
  useHasPermission: () => state.canPublish,
  hasPermission: () => state.canPublish,
}))
vi.mock('../../services/product-detail.service', () => ({
  cancelScheduledPublish: vi.fn(), schedulePublish: vi.fn(), transitionProduct: vi.fn(),
}))
vi.mock('../catalog-validation/validation-api', () => ({
  fetchValidationReport: vi.fn(), validateProduct: vi.fn(),
  validationKeys: { report: (id: string) => ['product-validation-report', id] },
}))
vi.mock('../catalog-validation/ValidationPanel', () => ({
  ValidationPanel: ({ error }: { error?: string | null }) => <div>{error ? <p role="alert">{error}</p> : <p>Requisitos revisados</p>}</div>,
}))
vi.mock('./ProductPublicationPanel', () => ({
  ProductPublicationSection: () => <div>Historial registrado</div>,
}))

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1', sku: 'SKU-001', name: 'Cámara demo', description: null, categoryId: 'category-1', brandId: 'brand-1',
  technicalSpecs: null, isActive: true, isVisible: false, lifecycleStatus: 'DRAFT', allowedActions: [],
  category: { id: 'category-1', name: 'Cámaras', slug: 'camaras' }, brand: { id: 'brand-1', name: 'Marca', slug: 'marca' },
  images: [], prices: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides,
})
const draft = (overrides: Partial<Product> = {}) => product({ allowedActions: ['PUBLISH'], ...overrides })

const brandMissing: ValidationIssueView = { code: 'base.brand_present', severity: 'error', field: 'brand', section: 'identidad', message: 'Sin marca.', fix: 'Asigna una marca.' }
const imageMissing: ValidationIssueView = { code: 'media.primary_image', severity: 'error', field: 'images', section: 'multimedia', message: 'Sin imagen.', fix: 'Sube una imagen.' }
const priceMissing: ValidationIssueView = { code: 'offer.price_valid', severity: 'error', field: 'prices', section: 'oferta', message: 'Sin precio.', fix: 'Carga un precio.' }
const fileMissing: ValidationIssueView = { code: 'media.file_exists', severity: 'error', field: 'resources', section: 'documentos', message: 'Archivo ausente.', fix: 'Vuelve a subirlo.' }
const datasheetWarning: ValidationIssueView = { code: 'docs.datasheet_missing', severity: 'warning', field: 'resources', section: 'documentos', message: 'Sin PDF.', fix: 'Añade un PDF.' }
const stockInfo: ValidationIssueView = { code: 'stock.zero_info', severity: 'info', field: 'stock', section: 'oferta', message: 'Sin stock.', fix: 'Nada.' }

const report = (issues: ValidationIssueView[] = [], over: Partial<ValidationReportView> = {}): ValidationReportView => ({
  productId: 'product-1', revisionId: 'rev-1',
  status: issues.some((issue) => issue.severity === 'error') ? 'CON_PROBLEMAS' : 'LISTA_PARA_PUBLICAR',
  issues, rulesVersion: 'cat05-r1', at: '2026-10-17T10:00:00.000Z', stale: false, ...over,
})

function showReport(data: ValidationReportView | null | undefined) {
  state.report = { data, isError: false, isPending: false }
}

function renderSection(item: Product, disabled = false, onGoToSection?: (sectionId: string) => void) {
  const queryClient = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LibraryPublicationSection product={item} disabled={disabled} onGoToSection={onGoToSection} />
    </QueryClientProvider>,
  )
}

const count = (markup: string, text: string) => markup.split(text).length - 1
const stepTitle = (title: string) => `>${title}</h4>`

describe('LibraryPublicationSection', () => {
  beforeEach(() => {
    state.canPublish = true
    state.priceWrites = 0
    state.report = { data: undefined, isError: false, isPending: false }
    state.queryOptions = []
    state.mutation.isPending = false
    state.mutation.isError = false
    state.mutation.error = null
    state.mutation.variables = undefined
    state.mutation.mutate.mockClear()
    state.mutation.reset.mockClear()
    state.queryClient.setQueryData.mockClear()
    state.queryClient.invalidateQueries.mockClear()
  })

  it('hides all publication UI and disables validation queries without publish permission', () => {
    state.canPublish = false
    const markup = renderSection(draft())
    expect(markup).toBe('')
    expect(state.queryOptions[0]?.enabled).toBe(false)
  })

  it('renders only lifecycle actions permitted by the server', () => {
    showReport(report())
    const draftMarkup = renderSection(draft())
    expect(draftMarkup).toContain('>Publicar</button>')
    expect(draftMarkup).toContain('>Programar</button>')
    expect(draftMarkup).not.toContain('>Despublicar</button>')

    const published = renderSection(product({ lifecycleStatus: 'PUBLISHED', allowedActions: ['UNPUBLISH'] }))
    expect(published).toContain('>Despublicar</button>')
    expect(published).not.toContain('>Publicar</button>')
    expect(published).not.toContain('Publicar cambios')
  })

  it('places Publicar only in step 4, and only while every requirement is met', () => {
    showReport(report())
    const markup = renderSection(draft())
    expect(count(markup, '>Publicar</button>')).toBe(1)
    expect(markup.indexOf('>Publicar</button>')).toBeGreaterThan(markup.indexOf(stepTitle('Revisar y publicar')))

    showReport(report([brandMissing]))
    expect(renderSection(draft())).not.toContain('>Publicar</button>')
  })

  it('disables publication while the ficha has unsaved changes', () => {
    showReport(report())
    const markup = renderSection(draft(), true)
    expect(markup).toContain('Guarda o descarta los cambios de la ficha antes de gestionar su publicación.')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publicar<\/button>/)
    expect(markup).toContain('Hay cambios sin guardar en la ficha.')
  })

  it('blocks publication until a price mutation finishes', () => {
    showReport(report())
    state.priceWrites = 1
    const markup = renderSection(draft())
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publicar<\/button>/)
    expect(markup).toContain('Espera a que termine el cambio de precios')
    expect(markup).toContain('Hay un cambio de precios en curso.')
  })

  it('shows validation report load errors in the summary for a product without publish actions', () => {
    state.report = { data: undefined, isError: true, isPending: false }
    const markup = renderSection(product())
    expect(markup).toContain('No se pudieron cargar los requisitos.')
    expect(markup).toContain('role="alert"')
    expect(markup).toMatch(/<details[^>]*open=""/)
  })

  it('explains how to recover when the requirements cannot load in the steps', () => {
    state.report = { data: undefined, isError: true, isPending: false }
    const markup = renderSection(draft())
    expect(markup).toContain('No se pudieron cargar los requisitos. Recarga la página para intentarlo de nuevo.')
    expect(markup).toContain('No se pudo cargar qué falta. Recarga la página para intentarlo de nuevo.')
    expect(markup).not.toContain('>Publicar</button>')
  })

  it('shows a skeleton while the requirements load', () => {
    state.report = { data: undefined, isError: false, isPending: true }
    const markup = renderSection(draft())
    expect(markup).toContain('Cargando los pasos para publicar…')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain('<ol')

    const summaryMarkup = renderSection(product())
    expect(summaryMarkup).toContain('Cargando requisitos…')
  })

  it('lists the four steps in order as an ordered list', () => {
    showReport(report())
    const markup = renderSection(draft())
    expect(markup).toContain('aria-label="Pasos para publicar"')
    const positions = ['Datos básicos', 'Imagen principal', 'Precio vigente', 'Revisar y publicar'].map((title) => markup.indexOf(stepTitle(title)))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('opens only the first incomplete step and blocks the rest', () => {
    showReport(report([brandMissing, imageMissing]))
    const markup = renderSection(draft())
    expect(markup).toContain('Falta elegir la marca.')
    expect(markup).not.toContain('Falta una imagen principal.')
    expect(count(markup, 'aria-current="step"')).toBe(1)
    expect(markup.indexOf('aria-current="step"')).toBeLessThan(markup.indexOf(stepTitle('Imagen principal')))
    expect(count(markup, 'Completa el paso 1 para continuar')).toBe(3)
    expect(count(markup, 'aria-disabled="true"')).toBe(3)
  })

  it('marks completed steps as Listo with a one-line summary', () => {
    showReport(report([priceMissing]))
    const markup = renderSection(draft())
    expect(count(markup, '>Listo</span>')).toBe(2)
    expect(markup).toContain('Nombre, categoría y marca listos.')
    expect(markup).toContain('Imagen principal lista.')
    expect(markup).toContain('Falta un precio vigente y positivo.')
    expect(count(markup, 'Completa el paso 3 para continuar')).toBe(1)
  })

  it('offers Ir a corregir on the active step only when the person can edit the ficha', () => {
    showReport(report([brandMissing]))
    expect(count(renderSection(draft(), false, () => undefined), '>Ir a corregir</button>')).toBe(1)
    expect(renderSection(draft())).not.toContain('Ir a corregir')
  })

  it('asks for a check when the ficha was never checked or the check is stale', () => {
    showReport(null)
    let markup = renderSection(draft())
    expect(markup).toContain('Todavía no se ha comprobado la ficha.')
    expect(markup).toContain('>Validar ficha</button>')
    expect(markup).not.toContain('>Publicar</button>')

    showReport(report([], { stale: true }))
    markup = renderSection(draft())
    expect(markup).toContain('quedó desactualizada tras una edición')
    expect(markup).toContain('>Volver a validar</button>')
  })

  it('shows non-blocking notices in step 4 and keeps Publicar enabled', () => {
    showReport(report([datasheetWarning, stockInfo]))
    const markup = renderSection(draft())
    expect(markup).toContain('Avisos que no impiden publicar')
    expect(markup).toContain('Falta la ficha técnica en PDF.')
    expect(markup).toContain('No hay stock: la tienda mostrará «Agotado».')
    expect(count(markup, '>Publicar</button>')).toBe(1)
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Publicar<\/button>/)
  })

  it('keeps a missing own file in step 4 with a link to fix it', () => {
    showReport(report([fileMissing]))
    const markup = renderSection(draft(), false, () => undefined)
    expect(markup).toContain('Un archivo no está en el almacén')
    expect(markup).toContain('>Ir a corregir</button>')
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Publicar<\/button>/)
  })

  it('keeps the schedule and cancel actions for a scheduled draft', () => {
    showReport(report())
    const markup = renderSection(draft({ publishAt: '2099-01-01T10:00:00.000Z' }))
    expect(markup).toContain('Programado para el')
    expect(markup).toContain('>Cancelar programación</button>')
    expect(markup).toContain('>Reprogramar</button>')
  })

  it('announces step changes politely and keeps the history collapsed', () => {
    showReport(report([brandMissing]))
    const markup = renderSection(draft())
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toMatch(/<details class="border-t border-neutral-200 pt-4"><summary[^>]*>Historial de publicación<\/summary>/)
  })

  it('states that editing a published ficha does not itself publish a revision', () => {
    const markup = renderSection(product({ lifecycleStatus: 'PUBLISHED', allowedActions: ['UNPUBLISH'] }))
    expect(markup).toContain('Guardar una edición no publica una nueva revisión.')
    expect(markup).not.toContain('Publicar cambios')
    expect(markup).not.toContain('>Publicar</button>')
  })
})
