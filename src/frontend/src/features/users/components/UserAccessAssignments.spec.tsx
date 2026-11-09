import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserAccessPanel } from './UserAccessAssignments'
import { accessActionNotice, userAccessKey } from '../access'
import {
  UserAccessServiceError,
  type AccessPackage,
  type UserAccessState,
} from '../../../services/users.service'
import { useAuthStore } from '../../../stores/auth.store'
import UserAccessAssignments from './UserAccessAssignments'

/**
 * El repo no tiene entorno DOM ni @testing-library: el panel se afirma en
 * render de servidor con la caché de react-query SEMBRADA (mismo patrón que
 * AgendaCalendarPage.spec.tsx). Los clicks viven en el recorrido HTTP real
 * (e2e sobre 5180/3001) y en la spec de `features/users/access.ts`
 * (`applyPackageInCache`/`revokePackageInCache` con la API mockeada).
 */

const TARGET = { id: 'user-1', name: 'Vendedor de prueba' }

function packageOf(over: Partial<AccessPackage> & { id: string; name: string }): AccessPackage {
  return { selections: [], applied: false, sourceId: null, ...over }
}

function accessState(partial: Partial<UserAccessState> = {}): UserAccessState {
  return {
    catalogVersion: 'panels-20261019-3',
    accessVersion: 7,
    grants: [],
    sources: [
      {
        id: 'src-1',
        kind: 'template',
        templateId: 'vendedor',
        catalogVersion: 'panels-20261019-3',
        grantedById: 'admin-1',
        reason: 'template-applied',
      },
    ],
    packages: [
      packageOf({
        id: 'vendedor',
        name: 'Vendedor',
        applied: true,
        sourceId: 'src-1',
        selections: [
          { actionId: 'customers:read', scope: 'own' },
          { actionId: 'customers:edit', scope: 'own' },
          { actionId: 'products:read', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'supervisor-comercial',
        name: 'Supervisor comercial',
        selections: [{ actionId: 'teamInsights:read', scope: 'team' }],
      }),
      packageOf({
        id: 'gestion-comercial',
        name: 'Gestión comercial',
        selections: [{ actionId: 'customers:reassign', scope: 'team' }],
      }),
      packageOf({
        id: 'biblioteca-consulta',
        name: 'Productos',
        selections: [
          { actionId: 'products:read', scope: 'global' },
          { actionId: 'prices:read', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'biblioteca-fichas',
        name: 'Fichas',
        selections: [
          { actionId: 'products:read', scope: 'global' },
          { actionId: 'products:write', scope: 'global' },
          { actionId: 'products:delete', scope: 'global' },
          { actionId: 'products:validate', scope: 'global' },
          { actionId: 'products:notes', scope: 'global' },
          { actionId: 'prices:read', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'biblioteca-precios',
        name: 'Precios',
        selections: [
          { actionId: 'products:read', scope: 'global' },
          { actionId: 'prices:read', scope: 'global' },
          { actionId: 'prices:preview', scope: 'global' },
          { actionId: 'prices:save', scope: 'global' },
          { actionId: 'prices:apply', scope: 'global' },
          { actionId: 'providers:read', scope: 'global' },
          { actionId: 'providers:write', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'biblioteca-publicacion',
        name: 'Publicar en tienda',
        selections: [
          { actionId: 'products:read', scope: 'global' },
          { actionId: 'products:validate', scope: 'global' },
          { actionId: 'products:publish', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'biblioteca-actualizacion',
        name: 'Actualización (anterior)',
        assignable: false,
        selections: [
          { actionId: 'products:read', scope: 'global' },
          { actionId: 'products:write', scope: 'global' },
          { actionId: 'products:delete', scope: 'global' },
          { actionId: 'products:validate', scope: 'global' },
          { actionId: 'products:notes', scope: 'global' },
          { actionId: 'prices:read', scope: 'global' },
          { actionId: 'prices:preview', scope: 'global' },
          { actionId: 'prices:save', scope: 'global' },
          { actionId: 'prices:apply', scope: 'global' },
          { actionId: 'providers:read', scope: 'global' },
          { actionId: 'providers:write', scope: 'global' },
        ],
      }),
      packageOf({ id: 'gestion-listas-precios', name: 'Listas y precios (anterior)', applied: true, selections: [{ actionId: 'listas:read', scope: 'global' }] }),
      packageOf({ id: 'biblioteca-productos', name: 'Biblioteca de productos (anterior)', applied: true, selections: [{ actionId: 'products:read', scope: 'global' }] }),
      packageOf({ id: 'publicacion-catalogo', name: 'Publicación del catálogo (anterior)', applied: true, selections: [{ actionId: 'products:publish', scope: 'global' }] }),
    ],
    actions: [
      { id: 'customers:read', label: 'Consultar clientes', purpose: 'Consultar cartera', allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true },
      { id: 'listas:read', label: 'Consultar listas', purpose: 'Consultar una lista', allowedScopes: ['list'], dependencies: [], enabled: true },
    ],
    ...partial,
  }
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <UserAccessPanel user={TARGET} />
    </QueryClientProvider>,
  )
}

function renderWorkspace(client: QueryClient, roles: string[] = []) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <UserAccessPanel user={TARGET} roles={roles} workspace />
    </QueryClientProvider>,
  )
}

function seeded(state: UserAccessState) {
  const client = new QueryClient()
  client.setQueryData(userAccessKey(TARGET.id), state)
  return client
}

/** Subárbol del panel con ese `aria-label`; '' si la sección no se pintó. */
function sectionOf(html: string, label: string): string {
  const start = html.indexOf(`aria-label="${label}"`)
  if (start < 0) return ''
  const end = html.indexOf('</section>', start)
  return html.slice(start, end < 0 ? undefined : end)
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function loginSuperAdmin() {
  const session = {
    isAuthenticated: true,
    user: {
      id: 'admin-1',
      name: 'Super Admin de prueba',
      email: 'admin@example.invalid',
      roles: ['Super Admin'],
      permissions: [],
    },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

beforeEach(() => {
  loginSuperAdmin()
})

describe('UserAccessPanel — paquetes con acciones concretas (ficha regla 1)', () => {
  it('no presenta Marketing como habilitado con acciones sueltas sin paquete', () => {
    const html = renderWorkspace(seeded(accessState({
      packages: [],
      sources: [{ id: 'manual-1', kind: 'manual', templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null }],
      grants: [{ sourceId: 'manual-1', actionId: 'marketing:read', scope: 'global' }],
      actions: [{ id: 'marketing:read', label: 'Consultar Marketing', purpose: 'Consultar contenido', enabled: true, allowedScopes: ['global'], dependencies: [] }],
    })), ['Operador'])
    expect(html).toContain('Marketing y mercadeo')
    expect(html).toContain('No habilitado · revisa los paquetes')
  })

  it('activa el árbol del workspace y conserva montados los paneles ocultos', () => {
    const html = renderWorkspace(seeded(accessState()), ['Super Admin'])

    expect(html).toContain('aria-label="Paneles de acceso"')
    expect(html).toContain('aria-pressed="true" class="access-panel-button"><span>Comercial</span>')
    expect(html).toContain('class="access-tree-group"')
    expect(html).toContain('class="access-panel-view access-panel-hidden"')
    expect(html).toContain('aria-label="Panel Biblioteca"')
    expect(html).toContain('Super Admin conserva acceso administrativo por su rol')
    expect(html).toContain('Guardar Biblioteca')
    expect(html).toContain('Guardar acciones individuales')
  })

  it('permite editar las acciones de Marketing directamente, conservando su alcance', () => {
    const html = render(seeded(accessState({
      sources: [{ id: 'manual-1', kind: 'manual', templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null }],
      grants: [{ sourceId: 'manual-1', actionId: 'marketing:edit', scope: 'global' }],
      actions: [{ id: 'marketing:edit', label: 'Editar contenido', purpose: 'Preparar piezas', enabled: true, allowedScopes: ['global'], dependencies: [] }],
    })))
    const marketing = sectionOf(html, 'Marketing y mercadeo')
    expect(marketing).toContain('aria-label="Contenido"')
    const checkbox = marketing.match(/<input[^>]*aria-label="Editar contenido"[^>]*>/)?.[0] ?? ''
    expect(checkbox).toMatch(/\schecked(?:=|\s|\/?>)/)
    expect(checkbox).not.toMatch(/\sdisabled(?:=|\s|\/?>)/)
    expect(marketing).toContain('Alcance marketing:edit')
    expect(marketing).toContain('Global')
  })

  it('impide sustituir varias fuentes manuales mediante una selección ambigua', () => {
    const html = render(seeded(accessState({
      sources: ['m1', 'm2'].map((id) => ({ id, kind: 'manual', templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null })),
      grants: [{ sourceId: 'm1', actionId: 'customers:read', scope: 'own' }, { sourceId: 'm2', actionId: 'customers:read', scope: 'team' }],
    })))
    expect(html).toContain('Hay varias asignaciones manuales.')
    const save = html.match(/<button[^>]*>Guardar acciones individuales<\/button>/)?.[0] ?? ''
    expect(save).toMatch(/\sdisabled(?:=|\s|\/?>)/)
  })

  it('presenta los paneles y selecciones plegados y permite asignar paquetes sin abrir su detalle', () => {
    const html = render(seeded(accessState()))
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/)
    const commercial = sectionOf(html, 'Comercial')
    expect(commercial).toContain('1 de 3 paquetes asignados')
    expect(commercial.indexOf('type="checkbox"')).toBeLessThan(commercial.indexOf('Ver 3 acciones de Vendedor'))
    expect(html).toContain('0 acciones asignadas')
  })

  it('agrupa los nueve paquetes por panel y muestra acciones y alcances del servidor', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Vendedor')
    expect(html).toContain('Supervisor comercial')
    expect(html).toContain('Gestión comercial')
    expect(html).toContain('Comercial')
    expect(html).toContain('aria-label="Biblioteca"')
    expect(html).toContain('aria-label="Accesos anteriores"')
    // Biblioteca vigente: Productos / Fichas / Precios, con Publicar en tienda como complemento.
    expect(html).toContain('Productos')
    expect(html).toContain('Fichas')
    expect(html).toContain('Precios')
    expect(html).toContain('Publicar en tienda')
    expect(html).toContain('Guardar Biblioteca')
    // Paquetes anteriores: siguen listados para conservar accesos retirables.
    expect(html).toContain('Acceso anterior')
    // Selecciones concretas y versionadas, no un «habilitar acceso» genérico.
    expect(html).toContain('customers:edit')
    expect(html).toContain('alcance Propio')
    expect(html).toContain('Consultar clientes')
    expect(html).toContain('teamInsights:read')
    expect(html).toContain('alcance Equipo')
    expect(html).toContain('panels-20261019-3')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('Asignar paquete')
  })

  it('Marketing y mercadeo es un panel asignable con sus tres paquetes y etiquetas legibles', () => {
    const base = accessState()
    const marketing = [
      packageOf({ id: 'marketing-consulta', name: 'Ver banners y pop-ups', selections: [{ actionId: 'marketing:read', scope: 'global' }] }),
      packageOf({
        id: 'marketing-edicion',
        name: 'Preparar banners y pop-ups',
        selections: [
          { actionId: 'marketing:read', scope: 'global' },
          { actionId: 'marketing:create', scope: 'global' },
          { actionId: 'marketing:edit', scope: 'global' },
          { actionId: 'marketing:delete', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'marketing-publicacion',
        name: 'Publicar y retirar banners',
        selections: [{ actionId: 'marketing:read', scope: 'global' }, { actionId: 'marketing:publish', scope: 'global' }],
      }),
    ]
    const html = render(seeded(accessState({ packages: [...base.packages, ...marketing] })))
    const section = sectionOf(html, 'Marketing y mercadeo')

    expect(section).toContain('Marketing y mercadeo')
    for (const name of ['Ver banners y pop-ups', 'Preparar banners y pop-ups', 'Publicar y retirar banners']) expect(section).toContain(name)
    for (const label of ['Crear', 'Editar', 'Publicar y retirar', 'Eliminar']) expect(section).toContain(`<span>${label}</span>`)
    expect(countOf(section, 'Asignar paquete')).toBe(3)
    expect(section).toContain('alcance Global')
  })

  it('sin paquetes de marketing en el catálogo no pinta la sección', () => {
    expect(render(seeded(accessState()))).not.toContain('aria-label="Marketing y mercadeo"')
  })

  it('muestra el estado applied y la fuente del paquete aplicado', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Aplicado')
    expect(html).toContain('Fuente: paquete (template-applied)')
    expect(html).toContain('Sin aplicar')
    expect(html).toContain('Paquete asignado')
    expect(html).toContain('Asignar paquete')
  })

  it('sin concesiones el panel sigue mostrando el catálogo de paquetes (sin migración silenciosa)', () => {
    const html = render(
      seeded(
        accessState({
          grants: [],
          sources: [],
          packages: accessState().packages.map((pkg) => ({ ...pkg, applied: false, sourceId: null })),
        }),
      ),
    )

    expect(html).toContain('Asignar paquete')
    expect(html).not.toContain('Paquete asignado')
    expect(html).toContain('Versión de concesiones: 7')
  })

  it('expone la versión OCC que los botones envían al servidor', () => {
    const html = render(seeded(accessState({ accessVersion: 12 })))

    expect(html).toContain('Versión de concesiones: 12')
  })

  it('presenta acciones individuales agrupadas como checklist', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Acciones individuales')
    expect(html).toContain('Guardar acciones individuales')
    expect(html).toContain('Consultar clientes')
    expect(html).toContain('customers:read')
    expect(html).toContain('Vendedor')
    expect(html).toContain('type="checkbox"')
  })

  it('las estadísticas de Biblioteca en Mi resumen aparecen como casillas con su etiqueta', () => {
    const base = accessState()
    const stats = [
      { id: 'libraryStats:products', label: 'Estadísticas de Productos', dependency: 'products:read' },
      { id: 'libraryStats:update', label: 'Estadísticas de Fichas', dependency: 'products:write' },
      { id: 'libraryStats:publication', label: 'Estadísticas de Publicar en tienda', dependency: 'products:publish' },
    ]
    const html = render(seeded(accessState({
      actions: [
        ...(base.actions ?? []),
        ...stats.map((item) => ({ id: item.id, label: item.label, purpose: 'Ver cifras', allowedScopes: ['global'], dependencies: [item.dependency], enabled: true })),
      ],
    } as never)))

    expect(html).toContain('Estadísticas en Mi resumen')
    for (const item of stats) {
      expect(html).toContain(item.label)
      expect(html).toContain(item.id)
    }
  })

  it('muestra el acceso anterior aplicado solo como revocable, sin revelar su procedencia', () => {
    const base = accessState()
    const html = render(seeded(accessState({
      grants: [],
      sources: [{
        id: 'src-legacy', kind: 'template', templateId: 'biblioteca-productos', catalogVersion: 'panels-20261026-1', grantedById: 'admin-1', reason: 'template-applied',
      }],
      packages: base.packages.map((pkg) => pkg.id === 'biblioteca-productos'
        ? { ...pkg, applied: true, sourceId: 'src-legacy' }
        : { ...pkg, applied: false, sourceId: null }),
    })))

    const nameAt = html.indexOf('<label', html.indexOf('aria-label="Accesos anteriores"'))
    const block = html.slice(nameAt, html.indexOf('</details>', nameAt))
    const checkbox = block.match(/<input[^>]*>/)?.[0] ?? ''

    expect(block).not.toContain('Fuente: paquete')
    expect(block).toContain('Retirar acceso anterior')
    expect(checkbox).toMatch(/\bchecked\b/)
    expect(checkbox).not.toMatch(/\sdisabled(?:=|\s|\/?>)/)
  })

  it('oculta los paquetes anteriores que no están aplicados', () => {
    const html = render(seeded(accessState({
      packages: accessState().packages.map((pkg) => ({ ...pkg, applied: false, sourceId: null })),
    })))
    expect(sectionOf(html, 'Accesos anteriores')).toBe('')
  })

  it('Biblioteca suma Importaciones y Catálogos maestros con 16 casillas y Aprobar datos clave aparte', () => {
    const html = render(seeded(accessState()))
    const biblioteca = sectionOf(html, 'Biblioteca')
    for (const tab of ['Importaciones', 'Catálogos maestros']) {
      expect(countOf(biblioteca, `<fieldset aria-label="${tab}"`)).toBe(1)
    }
    for (const label of ['Ver importaciones', 'Importar datos', 'Ver catálogos maestros', 'Editar catálogos maestros', 'Aprobar datos clave']) {
      expect(biblioteca).toContain(label)
    }
    const maestros = biblioteca.slice(biblioteca.indexOf('<fieldset aria-label="Catálogos maestros"'))
    expect(maestros.indexOf('Editar catálogos maestros')).toBeLessThan(maestros.indexOf('Aprobar datos clave'))
    expect(countOf(biblioteca, 'type="checkbox"')).toBe(18 + 5) // 18 permission boxes (16 actions; some repeat across tabs) + 5 section boxes
    expect(biblioteca).not.toMatch(/imports:|masters:|approveSpecs/)
  })

  it('Biblioteca es un solo bloque con tres secciones y casillas por permiso, un único botón Guardar', () => {
    const html = render(seeded(accessState()))
    const biblioteca = sectionOf(html, 'Biblioteca')
    const anteriores = sectionOf(html, 'Accesos anteriores')

    expect(countOf(html, 'aria-label="Biblioteca"')).toBe(1)
    for (const tab of ['Productos', 'Fichas', 'Precios']) {
      expect(countOf(biblioteca, `<fieldset aria-label="${tab}"`)).toBe(1)
      expect(countOf(biblioteca, `<span>${tab}</span>`)).toBe(1)
    }
    for (const label of ['Ver productos', 'Ver precios', 'Ver fichas', 'Editar fichas', 'Validar ficha', 'Notas internas', 'Eliminar producto',
      'Revisar archivo de precios', 'Guardar revisión', 'Aplicar precios', 'Ver perfiles de proveedor', 'Editar perfiles de proveedor']) {
      expect(biblioteca).toContain(label)
    }
    expect(countOf(biblioteca, 'Guardar Biblioteca')).toBe(1)
    // Sin ids técnicos ni jerga visibles.
    expect(biblioteca).not.toMatch(/products:|prices:|providers:|ACL|scope/i)
    // Publicar en tienda es un complemento aparte, no una casilla del bloque.
    expect(biblioteca).not.toContain('Publicar en tienda')
    expect(html).toContain('aria-label="Complemento de Fichas"')
    // Los paquetes de Biblioteca ya no se asignan uno a uno.
    expect(html).not.toContain('Actualización (anterior)')
    expect(anteriores).toContain('<span>Acceso anterior</span>')
    expect(anteriores).not.toContain('listas:read')
    expect(anteriores).not.toContain('Listas y precios')
    expect(countOf(anteriores, '<span>Acceso anterior</span>')).toBe(3)
  })

  it('el paquete anterior Actualización aparece con sus casillas marcadas y sin botón propio', () => {
    const base = accessState()
    const html = render(seeded(accessState({
      sources: [...base.sources, {
        id: 'src-update', kind: 'template', templateId: 'biblioteca-actualizacion', catalogVersion: 'panels-20261028-1', grantedById: 'admin-1', reason: 'template-applied',
      }],
      grants: [
        { sourceId: 'src-update', actionId: 'products:read', scope: 'global' },
        { sourceId: 'src-update', actionId: 'products:write', scope: 'global' },
        { sourceId: 'src-update', actionId: 'prices:read', scope: 'global' },
        { sourceId: 'src-update', actionId: 'prices:preview', scope: 'global' },
      ],
      packages: base.packages.map((pkg) => pkg.id === 'biblioteca-actualizacion'
        ? { ...pkg, applied: true, sourceId: 'src-update' }
        : pkg),
    })))
    const biblioteca = sectionOf(html, 'Biblioteca')

    expect(html).not.toContain('Retirar paquete anterior')
    expect(biblioteca).toContain('reemplaza los paquetes y asignaciones anteriores de Biblioteca')
    expect(biblioteca).toContain('Verá las pestañas: Productos, Fichas, Precios.')
    // Mientras lo tenga, Publicar en tienda se puede asignar (el permiso de editar fichas ya existe).
    const complement = sectionOf(html, 'Complemento de Fichas')
    expect(complement.match(/<input[^>]*>/)?.[0] ?? '').not.toMatch(/disabled/)
  })

  it('Publicar en tienda queda bloqueado mientras no se haya guardado «Editar fichas»', () => {
    const html = render(seeded(accessState()))
    const complement = sectionOf(html, 'Complemento de Fichas')
    expect(complement.match(/<input[^>]*>/)?.[0] ?? '').toMatch(/disabled/)
    expect(complement).toContain('Marca y guarda primero')
  })

  it('un catálogo sin paquetes de Biblioteca conserva Comercial y los anteriores, y el bloque sigue disponible', () => {
    const state = accessState()
    const html = render(seeded(accessState({
      grants: [],
      sources: [],
      packages: state.packages.filter((pkg) => !['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios', 'biblioteca-actualizacion', 'biblioteca-publicacion'].includes(pkg.id)),
    })))

    expect(html).toContain('aria-label="Comercial"')
    expect(html).toContain('aria-label="Accesos anteriores"')
    expect(html).toContain('aria-label="Biblioteca"')
    expect(sectionOf(html, 'Accesos anteriores')).toContain('Acceso anterior')
  })

  it('sin paquetes conserva las acciones disponibles y omite los bloques vacíos', () => {
    const html = render(seeded(accessState({ grants: [], sources: [], packages: [] })))

    expect(html).toContain('aria-label="Comercial"')
    expect(html).toContain('aria-label="Clientes"')
    expect(html).not.toContain('se aplican al marcar')
    expect(html).not.toContain('aria-label="Complemento de Fichas"')
    expect(html).not.toContain('aria-label="Accesos anteriores"')
  })

  it('expone la revocación completa de una fuente manual', () => {
    const base = accessState()
    const html = render(seeded(accessState({
      sources: [...base.sources, {
        id: 'manual-1', kind: 'manual', templateId: null, catalogVersion: 'panels-20261019-3', grantedById: 'admin-1', reason: 'manual-assignment',
      }],
      grants: [{ sourceId: 'manual-1', actionId: 'customers:read', scope: 'own' }],
    })))

    expect(html).toContain('Retirar asignación manual')
  })

  it('advierte dentro de Biblioteca sobre una fuente manual que conserva pestañas y otros accesos', () => {
    const base = accessState()
    const manualSource = {
      id: 'manual-library', kind: 'manual' as const, templateId: null,
      catalogVersion: 'panels-20261019-3', grantedById: 'admin-1', reason: 'manual-assignment',
    }
    const html = render(seeded(accessState({
      sources: [...base.sources, manualSource],
      grants: [
        { sourceId: manualSource.id, actionId: 'products:read', scope: 'global' },
        { sourceId: manualSource.id, actionId: 'products:write', scope: 'global' },
        { sourceId: manualSource.id, actionId: 'products:publish', scope: 'global' },
        { sourceId: manualSource.id, actionId: 'products:notes', scope: 'global' },
        { sourceId: manualSource.id, actionId: 'prices:apply', scope: 'global' },
        { sourceId: manualSource.id, actionId: 'customers:read', scope: 'own' },
      ],
    })))
    const biblioteca = sectionOf(html, 'Accesos anteriores de Biblioteca')

    expect(biblioteca).toContain('Otra asignación previa mantiene acceso a Biblioteca')
    expect(biblioteca).toContain('Pestañas disponibles: Productos, Fichas, Publicar en tienda')
    expect(biblioteca).toContain('Gestionar notas de productos (Global)')
    expect(biblioteca).toContain('Aplicar precios (Global)')
    expect(biblioteca).toContain('Esta asignación también contiene accesos de otros paneles (Consultar clientes), que se conservan')
    expect(biblioteca).toContain('se conservan al guardar Biblioteca')
    expect(biblioteca).not.toContain('Retirar asignación manual')
    expect(html).not.toContain('Retirar asignación manual</button>')
  })

  it('bloquea guardar concesiones comerciales mientras existan permisos manuales antiguos', () => {
    const base = accessState()
    const html = render(seeded(accessState({
      sources: [...base.sources, {
        id: 'manual-legacy', kind: 'manual', templateId: null, catalogVersion: 'panels-20261019-3', grantedById: 'admin-1', reason: 'manual-assignment',
      }],
      grants: [{ sourceId: 'manual-legacy', actionId: 'listas:read', scope: 'global' }],
    })))
    expect(html).toContain('Hay concesiones manuales anteriores fuera de este editor.')
    expect(sectionOf(html, 'Accesos anteriores de Biblioteca')).toContain('Consultar listas (Global)')
  })
})

describe('accessActionNotice — avisos de 409 (versión) y 400/403/404', () => {
  it('el 409 es un aviso de versión con el mensaje del servidor', () => {
    const notice = accessActionNotice(
      new UserAccessServiceError('conflict', 'Las concesiones cambiaron; recargue.', 409, 'access-version-conflict'),
    )

    expect(notice).toEqual({ tone: 'conflict', message: 'Las concesiones cambiaron; recargue.' })
  })

  it('el resto de errores usa el mensaje tipado del service', () => {
    const notice = accessActionNotice(new UserAccessServiceError('invalid', 'La acción está deshabilitada.', 400))

    expect(notice).toEqual({ tone: 'error', message: 'La acción está deshabilitada.' })
  })

  it('sin error no hay aviso', () => {
    expect(accessActionNotice(null)).toBeNull()
    expect(accessActionNotice(undefined)).toBeNull()
  })
})

describe('UserAccessAssignments — selector de destino por query (?usuario=)', () => {
  it('ofrece elegir usuario antes de mostrar paquetes', () => {
    const client = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/users/access']}>
          <UserAccessAssignments />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('Accesos de usuarios')
    expect(html).toContain('Buscar usuario')
    expect(html).toContain('Selecciona un usuario')
    expect(html).not.toContain('Paquete asignado')
  })

  it('con ?usuario= monta el panel de ese usuario y sus paquetes', () => {
    const client = new QueryClient()
    client.setQueryData(['users', 'access-directory', ''], { pageParams: [0], pages: [{ data: [
      {
        id: TARGET.id,
        name: TARGET.name,
        email: 'vendedor@example.invalid',
        isActive: true,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        supervisorId: null,
        roles: [],
      },
    ], meta: { total: 201, skip: 0, take: 50 } }] })
    client.setQueryData(userAccessKey(TARGET.id), accessState())

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/users/access?usuario=${TARGET.id}`]}>
          <UserAccessAssignments />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('Vendedor de prueba')
    expect(html).toContain('Paquete asignado')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('Cargar más usuarios')
  })

  it('sin permiso no muestra el editor aunque la URL indique un usuario', () => {
    const session = { ...useAuthStore.getState(), user: { ...useAuthStore.getState().user!, roles: ['Consulta'] } }
    useAuthStore.setState(session)
    Object.assign(useAuthStore.getInitialState(), session)
    const client = seeded(accessState())
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/users/access?usuario=user-1']}><UserAccessAssignments /></MemoryRouter></QueryClientProvider>)
    expect(html).toContain('Sólo Super Admin')
    expect(html).not.toContain('Paquete asignado')
    expect(html).not.toContain('Buscar usuario')
  })
})
