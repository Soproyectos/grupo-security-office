import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { useAuthStore } from './stores/auth.store'
import { userAccessKey } from './features/users/access'
import type { AccessGrant } from './services/users.service'

vi.mock('./pages/ProductsPage', () => ({ default: () => <p>DATOS-BIBLIOTECA</p> }))
vi.mock('./pages/LibraryProductConsultationPage', () => ({ default: () => <p>DATOS-DETALLE-PRODUCTO</p> }))
vi.mock('./pages/LibraryUpdatePage', () => ({ default: () => <p>DATOS-PRECIOS</p> }))
vi.mock('./pages/LibraryProductQueuePage', () => ({ default: () => <p>DATOS-FICHAS</p> }))
vi.mock('./pages/LibraryProductEditorPage', () => ({ default: () => <p>DATOS-EDITOR-FICHA</p> }))
vi.mock('./pages/LibraryCatalogImportPage', () => ({ default: () => <p>DATOS-IMPORTADOR-CATALOGO</p> }))
vi.mock('./pages/LibraryMastersPage', () => ({ default: () => <p>DATOS-MAESTROS</p> }))
vi.mock('./pages/AssignedHome', () => ({ default: () => <p>DATOS-RESUMEN</p> }))
vi.mock('./pages/AssignedReportsPage', () => ({ default: () => <p>DATOS-EQUIPO</p> }))
vi.mock('./features/agenda/AgendaCalendarPage', () => ({ default: () => <p>DATOS-AGENDA</p> }))
vi.mock('./pages/CustomersPage', () => ({ default: () => <p>DATOS-CLIENTES</p> }))

function login(roles = ['Consulta']) {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions: [] } }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}
function renderAt(path: string, grants?: AccessGrant[], failed = false, packageIds: string[] = []) {
  const client = new QueryClient()
  if (grants) client.setQueryData(userAccessKey('u1'), {
    catalogVersion: 'v1', accessVersion: 1, grants, sources: [],
    packages: packageIds.map((id) => ({ id, name: id, selections: [], applied: true, sourceId: id })),
  })
  if (failed) client.getQueryCache().build(client, { queryKey: userAccessKey('u1') }).setState({ status: 'error', error: new Error('sin conexión') })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => login())
describe('rutas administrativas con asignaciones expresas', () => {
  it('usuario sin asignaciones queda sin datos al entrar por inicio o URL directa', () => {
    for (const path of ['/', '/commercial/products', '/commercial/customers', '/sales', '/supervisor']) {
      const html = renderAt(path, [])
      expect(html).toContain('Sin paneles asignados')
      expect(html).not.toMatch(/DATOS-(BIBLIOTECA|CLIENTES|RESUMEN|EQUIPO|AGENDA)/)
    }
  })
  it('nivel 0: un rol interno sin asignaciones entra a su agenda propia, y un cliente no', () => {
    expect(renderAt('/agenda', [])).toContain('DATOS-AGENDA')
    login(['Cliente'])
    const html = renderAt('/agenda', [])
    expect(html).toContain('Sin paneles asignados')
    expect(html).not.toContain('DATOS-AGENDA')
  })
  it('cargar o fallar no monta la Biblioteca aunque haya datos antiguos de acceso', () => {
    expect(renderAt('/commercial/products')).not.toContain('DATOS-BIBLIOTECA')
    const html = renderAt('/commercial/products', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], true)
    expect(html).not.toContain('DATOS-BIBLIOTECA')
  })
  it('un usuario de cualquier cargo entra al paquete Productos que recibió', () => {
    login(['Vendedor'])
    const html = renderAt('/commercial/products', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], false, ['biblioteca-consulta'])
    expect(html).toContain('DATOS-BIBLIOTECA')
    expect(html).toContain('>Biblioteca</h1>')
  })
  it('Precios monta con su paquete y no abre por grant dependiente sin paquete exacto', () => {
    const allowed = renderAt('/commercial/library/update', [{ sourceId: 's1', actionId: 'prices:preview', scope: 'global' }], false, ['biblioteca-precios'])
    expect(allowed).toContain('DATOS-PRECIOS')
    expect(renderAt('/commercial/library/update', [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
      { sourceId: 's1', actionId: 'prices:preview', scope: 'global' },
    ])).not.toContain('DATOS-PRECIOS')
    expect(renderAt('/commercial/library/update', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], false, ['biblioteca-consulta'])).not.toContain('DATOS-PRECIOS')
    expect(renderAt('/commercial/library/update', [{ sourceId: 's1', actionId: 'listas:read', scope: 'global' }])).not.toContain('DATOS-PRECIOS')
    expect(renderAt('/commercial/library/update', [])).not.toContain('DATOS-PRECIOS')
  })
  it('Fichas monta con su paquete y no abre por grant dependiente sin paquete exacto', () => {
    const allowed = renderAt('/commercial/library/update/products', [{ sourceId: 's1', actionId: 'products:write', scope: 'global' }], false, ['biblioteca-fichas'])
    expect(allowed).toContain('DATOS-FICHAS')
    expect(renderAt('/commercial/library/update/products', [{ sourceId: 's1', actionId: 'products:write', scope: 'global' }])).not.toContain('DATOS-FICHAS')
  })
  it('Importaciones monta con imports:read y su paquete; Fichas, Productos o un grant sin paquete no la abren', () => {
    const path = '/commercial/library/update/import'
    const allowed = renderAt(path, [{ sourceId: 's1', actionId: 'imports:read', scope: 'global' }], false, ['biblioteca-importaciones'])
    expect(allowed).toContain('DATOS-IMPORTADOR-CATALOGO')
    expect(allowed).toContain('Importaciones</a>')
    const fichas = renderAt(path, [{ sourceId: 's1', actionId: 'products:write', scope: 'global' }], false, ['biblioteca-fichas'])
    expect(fichas).not.toContain('DATOS-IMPORTADOR-CATALOGO')
    const noPackage = renderAt(path, [{ sourceId: 's1', actionId: 'imports:read', scope: 'global' }])
    expect(noPackage).not.toContain('DATOS-IMPORTADOR-CATALOGO')
    expect(noPackage).toContain('Sin paneles asignados')
    const consulta = renderAt(path, [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], false, ['biblioteca-consulta'])
    expect(consulta).not.toContain('DATOS-IMPORTADOR-CATALOGO')
    expect(renderAt(path, [])).not.toContain('DATOS-IMPORTADOR-CATALOGO')
  })
  it('Catálogos maestros y sus subrutas montan con masters:read; la URL directa sin concesión se niega', () => {
    const grants = [{ sourceId: 's1', actionId: 'masters:read', scope: 'global' as const }]
    for (const path of ['/commercial/library/masters', '/commercial/library/masters/marcas']) {
      expect(renderAt(path, grants, false, ['biblioteca-maestros'])).toContain('DATOS-MAESTROS')
      expect(renderAt(path, [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], false, ['biblioteca-consulta'])).not.toContain('DATOS-MAESTROS')
      expect(renderAt(path, grants)).not.toContain('DATOS-MAESTROS')
      expect(renderAt(path, [])).not.toContain('DATOS-MAESTROS')
    }
  })
  it('Super Admin entra a las pestañas nuevas sin paquetes', () => {
    login(['Super Admin'])
    expect(renderAt('/commercial/library/update/import', [])).toContain('DATOS-IMPORTADOR-CATALOGO')
    expect(renderAt('/commercial/library/masters', [])).toContain('DATOS-MAESTROS')
  })

  it('el editor de ficha monta con products:write, fuera del submenú de Biblioteca, y no abre sin esa acción', () => {
    const path = '/commercial/library/update/products/abc'
    // El paquete aplicado concede Fichas y, con ellas, el editor.
    const allowed = renderAt(path, [{ sourceId: 's1', actionId: 'products:write', scope: 'global' }], false, ['biblioteca-fichas'])
    expect(allowed).toContain('DATOS-EDITOR-FICHA')
    expect(allowed).not.toContain('Actualización')
    const denied = renderAt(path, [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }])
    expect(denied).not.toContain('DATOS-EDITOR-FICHA')
    expect(denied).toContain('Sin paneles asignados')
    // listas:read ya no concede ninguna pestaña de Biblioteca.
    const listsOnly = renderAt(path, [{ sourceId: 's1', actionId: 'listas:read', scope: 'global' }])
    expect(listsOnly).not.toContain('DATOS-EDITOR-FICHA')
    expect(listsOnly).toContain('Sin paneles asignados')
  })
  describe('cada pestaña tiene su propio acceso (combinaciones)', () => {
    const grantsOf = (...actionIds: string[]) => [...new Set(actionIds)].map((actionId) => ({ sourceId: 's1', actionId, scope: 'global' as const }))
    const FICHAS = grantsOf('products:read', 'products:write', 'prices:read')
    const PRECIOS = grantsOf('products:read', 'prices:read', 'prices:preview', 'prices:save', 'prices:apply')
    const PRODUCTOS = grantsOf('products:read', 'prices:read')
    const ROUTES = {
      productos: ['/commercial/products', 'DATOS-BIBLIOTECA'],
      fichas: ['/commercial/library/update/products', 'DATOS-FICHAS'],
      editor: ['/commercial/library/update/products/abc', 'DATOS-EDITOR-FICHA'],
      precios: ['/commercial/library/update', 'DATOS-PRECIOS'],
    } as const
    const opens = (name: keyof typeof ROUTES, grants: AccessGrant[], packages: string[]) => renderAt(ROUTES[name][0], grants, false, packages).includes(ROUTES[name][1])

    it.each([
      ['solo Fichas', FICHAS, ['biblioteca-fichas'], { productos: false, fichas: true, editor: true, precios: false }],
      ['solo Precios', PRECIOS, ['biblioteca-precios'], { productos: false, fichas: false, editor: false, precios: true }],
      ['solo Productos', PRODUCTOS, ['biblioteca-consulta'], { productos: true, fichas: false, editor: false, precios: false }],
      ['Fichas y Precios', [...FICHAS, ...PRECIOS], ['biblioteca-fichas', 'biblioteca-precios'], { productos: false, fichas: true, editor: true, precios: true }],
      ['las tres', [...FICHAS, ...PRECIOS, ...PRODUCTOS], ['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios'], { productos: true, fichas: true, editor: true, precios: true }],
      ['paquete anterior Actualización', [...FICHAS, ...PRECIOS], ['biblioteca-actualizacion'], { productos: false, fichas: true, editor: true, precios: true }],
    ] as Array<[string, AccessGrant[], string[], Record<keyof typeof ROUTES, boolean>]>)('%s', (_name, grants, packages, expected) => {
      for (const name of Object.keys(ROUTES) as Array<keyof typeof ROUTES>) {
        expect(opens(name, grants, packages), name).toBe(expected[name])
      }
    })
    it('quien no tiene Productos pero sí otra pestaña no ve el aviso de acceso denegado: se le redirige', () => {
      const html = renderAt('/commercial/products', FICHAS, false, ['biblioteca-fichas'])
      expect(html).not.toContain('DATOS-BIBLIOTECA')
      expect(html).not.toContain('No tienes acceso a este apartado.')
    })
  })
  it('redirige rutas antiguas de Listas a Productos sin montar sus páginas', () => {
    for (const path of ['/commercial/lists', '/commercial/lists/lista-1', '/commercial/lists/lista-1/products/p1', '/commercial/assignments']) {
      const html = renderAt(path, [{ sourceId: 's1', actionId: 'listas:read', scope: 'global' }, { sourceId: 's2', actionId: 'assignments:manage', scope: 'global' }])
      expect(html).not.toContain('ListaDetailPage')
      expect(html).not.toContain('Asignaciones</h1>')
      expect(html).not.toContain('DATOS-BIBLIOTECA')
    }
  })
  it('recibir un panel no permite abrir otra herramienta por URL', () => {
    const html = renderAt('/commercial/customers', [{ sourceId: 's1', actionId: 'quotes:read', scope: 'own' }])
    expect(html).not.toContain('DATOS-CLIENTES')
    expect(html).toContain('No tienes acceso a este apartado.')
  })
  it('retirar la última concesión conserva la identidad y retira la página', () => {
    expect(renderAt('/commercial/products', [{ sourceId: 's1', actionId: 'products:read', scope: 'global' }], false, ['biblioteca-consulta'])).toContain('DATOS-BIBLIOTECA')
    expect(renderAt('/commercial/products', [])).not.toContain('DATOS-BIBLIOTECA')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
  it('Fichas y Publicar en tienda no abren Productos aunque sus paquetes concedan products:read', () => {
    const update = [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' as const },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' as const },
    ]
    const publication = [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' as const },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' as const },
      { sourceId: 's1', actionId: 'products:publish', scope: 'global' as const },
    ]
    expect(renderAt('/commercial/products', update, false, ['biblioteca-fichas'])).not.toContain('DATOS-BIBLIOTECA')
    expect(renderAt('/commercial/products', publication, false, ['biblioteca-publicacion'])).not.toContain('DATOS-BIBLIOTECA')
    expect(renderAt('/commercial/products/p1', update, false, ['biblioteca-fichas'])).not.toContain('DATOS-DETALLE-PRODUCTO')
    expect(renderAt('/commercial/products', update)).not.toContain('DATOS-BIBLIOTECA')
    expect(renderAt('/commercial/library/update/products', update, false, ['biblioteca-fichas'])).toContain('DATOS-FICHAS')
  })
  it('las rutas antiguas de Publicación redirigen a las fichas de Biblioteca', () => {
    const grants = [
      { sourceId: 's1', actionId: 'products:read', scope: 'global' as const },
      { sourceId: 's1', actionId: 'products:write', scope: 'global' as const },
      { sourceId: 's1', actionId: 'products:publish', scope: 'global' as const },
    ]
    for (const path of ['/catalog-management/publication', '/catalog-management/publication/products/p1']) {
      const html = renderAt(path, grants, false, ['biblioteca-fichas', 'biblioteca-publicacion'])
      expect(html).toContain('Navegación de Biblioteca')
      expect(html).not.toContain('>Publicación<')
    }
  })
  it('Super Admin conserva acceso a todas las pestañas y rutas sin paquetes aplicados', () => {
    login(['Super Admin'])
    for (const [path, marker] of [
      ['/commercial/products', 'DATOS-BIBLIOTECA'],
      ['/commercial/library/update', 'DATOS-PRECIOS'],
      ['/commercial/library/update/products', 'DATOS-FICHAS'],
    ] as const) {
      expect(renderAt(path, [], false)).toContain(marker)
    }
  })
  it('Supervisor abre datos reales del equipo y no el prototipo ficticio', () => {
    login(['Supervisor'])
    const html = renderAt('/supervisor', [{ sourceId: 's1', actionId: 'teamInsights:read', scope: 'team' }])
    expect(html).toContain('DATOS-EQUIPO')
    expect(html).not.toContain('Vendedor de prueba A')
  })
  it('Agenda es una herramienta compartida fuera de los paneles', () => {
    expect(renderAt('/agenda', [{ sourceId: 's1', actionId: 'activities:read', scope: 'own' }])).toContain('DATOS-AGENDA')
  })
  it('la excepción explícita permite que Super Admin asigne paneles', () => {
    login(['Super Admin'])
    expect(renderAt('/users/access', [])).toContain('Asignación de paquetes de acceso')
  })
  it('no aplica estas restricciones administrativas a la tienda pública', () => {
    expect(renderAt('/tienda', [])).not.toContain('Sin paneles asignados')
  })
})
