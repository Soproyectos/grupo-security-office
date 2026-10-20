import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  roles: new Set<string>(),
  query: vi.fn(),
}))
vi.mock('../lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('../lib/rbac')>('../lib/rbac')
  return {
    ...actual,
    hasPermission: (p: string) => mocks.permissions.has(p),
    canManageListas: () => mocks.roles.has('Admin'),
    canDeletePrices: () => mocks.roles.has('Admin'),
    canViewListas: () => true,
    canCreateLista: () => false,
    canDeleteLista: () => false,
  }
})
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'fixture-list' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: unknown }) => children as never,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
    mocks.query(options)
    return {
      data: options.queryKey[0] === 'lista'
        ? { id: 'fixture-list', name: 'Lista prueba', code: 'PRUEBA', currency: 'COP', isActive: true, updatedAt: '2026-10-16T12:00:00Z', responsible: null }
        : undefined,
      isLoading: false,
      error: null,
    }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

import ListaDetailPage from './ListaDetailPage'
import PriceImportPreviewPanel from '../features/price-import/PriceImportPreviewPanel'

/** COM-05/COM-06 — gate de la pestaña «Revisar precios» por la acción. */
describe('ListaDetailPage — acceso a la revisión de precios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = new Set(['listas:read', 'prices:preview'])
    mocks.roles = new Set()
  })

  it('ofrece la pestaña Revisar precios con la acción prices:preview', () => {
    const html = renderToStaticMarkup(<ListaDetailPage />)
    expect(html).toContain('Revisar precios')
    // CAT-01 intacto: las demás pestañas siguen presentes.
    expect(html).toContain('Productos')
    expect(html).toContain('Precios')
    expect(html).toContain('Accesos')
    expect(html).toContain('Auditoría')
    expect(html).toContain('Configuración')
  })

  it('oculta la pestaña sin la acción prices:preview', () => {
    mocks.permissions.delete('prices:preview')
    const html = renderToStaticMarkup(<ListaDetailPage />)
    expect(html).not.toContain('Revisar precios')
    // CAT-01 intacto.
    expect(html).toContain('Productos')
    expect(html).toContain('Precios')
    expect(html).toContain('Configuración')
  })

  it('un rol Admin Comercial sin la acción puede revisar (capa legada D5)', () => {
    mocks.permissions = new Set(['listas:read'])
    mocks.roles = new Set(['Admin'])
    const html = renderToStaticMarkup(<ListaDetailPage />)
    expect(html).toContain('Revisar precios')
  })

  it('el panel de revisión es solo lectura y no ofrece aplicar', () => {
    const html = renderToStaticMarkup(<PriceImportPreviewPanel listaId="fixture-list" />)
    expect(html).toContain('Revisar archivo')
    expect(html).toContain('no cambia ningún precio')
    expect(html).toContain('incluyen IVA')
    expect(html).toContain('Máximo 5 MB y 5000 filas')
    expect(html).toContain('type="file"')
    expect(html).not.toContain('Aplicar')
  })
})
