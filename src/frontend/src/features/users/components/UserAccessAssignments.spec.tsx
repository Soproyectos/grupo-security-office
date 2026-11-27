import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserAccessPanel } from './UserAccessAssignments'
import { accessActionNotice, userAccessKey } from '../access'
import {
  UserAccessServiceError,
  type AccessActionDefinition,
  type UserAccessState,
} from '../../../services/users.service'
import { useAuthStore } from '../../../stores/auth.store'
import UserAccessAssignments from './UserAccessAssignments'

/**
 * El repo no tiene entorno DOM ni @testing-library: el panel se afirma en
 * render de servidor con la caché de react-query SEMBRADA (mismo patrón que
 * AgendaCalendarPage.spec.tsx). Los clicks viven en el recorrido HTTP real
 * (e2e sobre 5180/3001) y en la spec de `features/users/access.ts`
 * (`refreshSessionAfterAccessChange` con la API mockeada).
 */

const TARGET = { id: 'user-1', name: 'Vendedor de prueba' }

const MANUAL_SOURCE = { id: 'manual-1', kind: 'manual', templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null }

function actionOf(id: string, label: string, over: Partial<AccessActionDefinition> = {}): AccessActionDefinition {
  return { id, label, purpose: `Permite: ${label}`, allowedScopes: ['global'], dependencies: [], enabled: true, ...over }
}

function accessState(partial: Partial<UserAccessState> = {}): UserAccessState {
  return {
    catalogVersion: 'panels-20261019-3',
    accessVersion: 7,
    grants: [],
    sources: [],
    actions: [
      { id: 'customers:read', label: 'Consultar clientes', purpose: 'Consultar cartera', allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true },
      { id: 'listas:read', label: 'Consultar listas', purpose: 'Consultar una lista', allowedScopes: ['list'], dependencies: [], enabled: true },
    ],
    ...partial,
  }
}

/** Catálogo con acciones de los tres paneles, para comprobar que ninguna casilla se bloquea. */
const FULL_ACTIONS: AccessActionDefinition[] = [
  actionOf('customers:read', 'Consultar clientes', { allowedScopes: ['own', 'team', 'global'] }),
  actionOf('customers:edit', 'Editar clientes', { allowedScopes: ['own', 'team', 'global'], dependencies: ['customers:read'] }),
  actionOf('quotes:read', 'Consultar cotizaciones', { allowedScopes: ['own', 'team', 'global'] }),
  actionOf('marketing:read', 'Ver campañas'),
  actionOf('marketing:edit', 'Editar campaña', { dependencies: ['marketing:read'] }),
  actionOf('marketing:publish', 'Publicar y retirar campañas', { dependencies: ['marketing:read'] }),
  actionOf('commercialPromotions:read', 'Consultar avisos internos', { allowedScopes: ['team', 'global'] }),
  actionOf('products:publish', 'Publicar producto', { dependencies: ['products:read', 'products:write'] }),
  actionOf('libraryStats:products', 'Estadísticas de Productos', { dependencies: ['products:read'] }),
]

function manualState(grants: UserAccessState['grants'], over: Partial<UserAccessState> = {}): UserAccessState {
  return accessState({
    sources: [{ ...MANUAL_SOURCE }],
    grants,
    actions: FULL_ACTIONS,
    ...over,
  })
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

const checkboxesOf = (html: string) => html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
const isDisabled = (input: string) => /\sdisabled(?:=|\s|\/?>)/.test(input)

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

describe('UserAccessPanel — acciones asignadas una a una, sin paquetes', () => {
  it('Marketing se muestra disponible con solo su acción asignada, sin ningún paquete', () => {
    const html = renderWorkspace(seeded(accessState({
      sources: [{ ...MANUAL_SOURCE }],
      grants: [{ sourceId: 'manual-1', actionId: 'marketing:read', scope: 'global' }],
      actions: [actionOf('marketing:read', 'Consultar Marketing')],
    })), ['Operador'])
    expect(html).toContain('Marketing y mercadeo')
    expect(html).toMatch(/<span>Marketing y mercadeo<\/span><span class="access-panel-summary">Disponible · 1 acciones concedidas/)
  })

  it('una acción de marketing con un alcance que no abre Banners avisa que aún no abre ninguna pestaña', () => {
    const html = renderWorkspace(seeded(accessState({
      sources: [{ ...MANUAL_SOURCE }],
      grants: [{ sourceId: 'manual-1', actionId: 'marketing:read', scope: 'own' }],
      actions: [actionOf('marketing:read', 'Consultar Marketing')],
    })), ['Operador'])
    expect(html).toContain('Aún no abre ninguna pestaña · revisa las acciones')
    expect(html).not.toMatch(/paquete/i)
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
      sources: [{ ...MANUAL_SOURCE }],
      grants: [{ sourceId: 'manual-1', actionId: 'marketing:edit', scope: 'global' }],
      actions: [actionOf('marketing:edit', 'Editar contenido', { purpose: 'Preparar piezas' })],
    })))
    const marketing = sectionOf(html, 'Marketing y mercadeo')
    expect(marketing).toContain('aria-label="Contenido"')
    const checkbox = marketing.match(/<input[^>]*aria-label="Editar contenido"[^>]*>/)?.[0] ?? ''
    expect(checkbox).toMatch(/\schecked(?:=|\s|\/?>)/)
    expect(checkbox).not.toMatch(/\sdisabled(?:=|\s|\/?>)/)
    expect(marketing).toContain('Alcance marketing:edit')
    expect(marketing).toContain('Global')
  })

  it('los avisos internos se asignan en Marketing y mercadeo y ya no en Comercial', () => {
    const promotionActions = ['read', 'create', 'edit', 'publish', 'withdraw'].map((action) => ({
      id: `commercialPromotions:${action}`, label: `Aviso ${action}`, purpose: 'Avisos', enabled: true, allowedScopes: ['team' as const], dependencies: [],
    }))
    const html = render(seeded(accessState({
      actions: [{ id: 'customers:read', label: 'Consultar clientes', purpose: 'Clientes', enabled: true, allowedScopes: ['own'], dependencies: [] }, ...promotionActions],
    })))
    const marketing = sectionOf(html, 'Marketing y mercadeo')
    expect(marketing).toContain('aria-label="Avisos internos"')
    expect(marketing).toContain('aria-label="Aviso read"')
    expect(marketing).toContain('Promociones internas')
    expect(marketing).toContain('Gestionar avisos')
    const commercial = sectionOf(html, 'Comercial')
    expect(commercial).not.toContain('aria-label="Avisos internos"')
    expect(commercial).not.toContain('aria-label="Aviso read"')
  })

  it('quien tiene solo avisos internos ve Marketing como disponible', () => {
    const html = renderWorkspace(seeded(accessState({
      sources: [{ ...MANUAL_SOURCE }],
      grants: [{ sourceId: 'manual-1', actionId: 'commercialPromotions:read', scope: 'team' }],
      actions: [{ id: 'commercialPromotions:read', label: 'Consultar avisos', purpose: 'Avisos', enabled: true, allowedScopes: ['team'], dependencies: [] }],
    })), ['Operador'])
    expect(html).toMatch(/<span>Marketing y mercadeo<\/span><span class="access-panel-summary">Disponible · 1 acciones concedidas/)
  })

  it('impide sustituir varias fuentes manuales mediante una selección ambigua', () => {
    const html = render(seeded(accessState({
      sources: ['m1', 'm2'].map((id) => ({ id, kind: 'manual', templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null })),
      grants: [{ sourceId: 'm1', actionId: 'customers:read', scope: 'own' }, { sourceId: 'm2', actionId: 'customers:read', scope: 'team' }],
    })))
    expect(html).toContain('varias asignaciones manuales antiguas')
    const save = html.match(/<button[^>]*>Guardar acciones individuales<\/button>/)?.[0] ?? ''
    expect(save).toMatch(/\sdisabled(?:=|\s|\/?>)/)
  })

  it('ninguna pantalla habla de paquetes ni de accesos anteriores', () => {
    const state = manualState([
      { sourceId: 'manual-1', actionId: 'customers:read', scope: 'own' },
      { sourceId: 'manual-1', actionId: 'marketing:read', scope: 'global' },
    ])
    for (const html of [render(seeded(state)), renderWorkspace(seeded(state), ['Operador']), render(seeded(accessState()))]) {
      expect(html).not.toMatch(/paquete/i)
      expect(html).not.toContain('Accesos anteriores')
      expect(html).not.toContain('Acceso anterior')
      expect(html).not.toContain('Fuente:')
      expect(html).not.toContain('Gestionar accesos')
    }
  })

  it('toda casilla se puede marcar y desmarcar siempre: ninguna viene bloqueada', () => {
    const html = render(seeded(manualState([
      { sourceId: 'manual-1', actionId: 'customers:read', scope: 'own' },
      { sourceId: 'manual-1', actionId: 'customers:edit', scope: 'own' },
      { sourceId: 'manual-1', actionId: 'marketing:read', scope: 'global' },
      { sourceId: 'manual-1', actionId: 'marketing:edit', scope: 'global' },
    ])))
    for (const label of ['Consultar clientes', 'Editar clientes', 'Consultar cotizaciones', 'Ver campañas', 'Editar campaña', 'Publicar y retirar campañas']) {
      const box = html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ''
      expect(box, label).not.toBe('')
      expect(isDisabled(box), label).toBe(false)
    }
    expect(html.match(/<input[^>]*aria-label="Editar clientes"[^>]*>/)?.[0]).toMatch(/\schecked(?:=|\s|\/?>)/)
    expect(html.match(/<input[^>]*aria-label="Consultar cotizaciones"[^>]*>/)?.[0]).not.toMatch(/\schecked(?:=|\s|\/?>)/)
    // Las casillas de grupo («marcar o desmarcar todo») tampoco están bloqueadas.
    const groupBoxes = checkboxesOf(html).filter((input) => input.includes('marcar o desmarcar todo'))
    expect(groupBoxes.length).toBeGreaterThan(0)
    expect(groupBoxes.some(isDisabled)).toBe(false)
  })

  it('cada acción asignada ofrece su alcance, con las opciones que dicta el catálogo', () => {
    const html = render(seeded(manualState([{ sourceId: 'manual-1', actionId: 'customers:read', scope: 'team' }])))
    const options = [...(html.match(/<select[^>]*aria-label="Alcance customers:read"[^>]*>(.*?)<\/select>/)?.[1] ?? '').matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1])
    expect(options).toEqual(['Propio', 'Equipo', 'Global'])
  })

  it('un permiso que llega de un cálculo automático (personas a cargo) se ve marcado y no se puede cambiar aquí', () => {
    const html = render(seeded(accessState({
      sources: [],
      grants: [{ sourceId: 'derived:team-hierarchy', actionId: 'customers:read', scope: 'team' }],
    })))
    const box = html.match(/<input[^>]*aria-label="Consultar clientes"[^>]*>/)?.[0] ?? ''
    expect(box).toMatch(/\schecked(?:=|\s|\/?>)/)
    expect(isDisabled(box)).toBe(true)
    expect(html).toContain('por personas a cargo')
    expect(html).not.toMatch(/paquete/i)
  })

  it('expone la versión OCC que los botones envían al servidor', () => {
    const html = render(seeded(accessState({ accessVersion: 12 })))

    expect(html).toContain('Versión de concesiones: 12')
    expect(html).toContain('panels-20261019-3')
  })

  it('presenta acciones individuales agrupadas como checklist', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Acciones individuales')
    expect(html).toContain('Guardar acciones individuales')
    expect(html).toContain('Consultar clientes')
    expect(html).toContain('customers:read')
    expect(html).toContain('type="checkbox"')
  })

  it('sin acciones de Marketing en el catálogo no pinta la sección', () => {
    expect(render(seeded(accessState()))).not.toContain('aria-label="Marketing y mercadeo"')
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

  it('Biblioteca se asigna por pestaña: Productos, Fichas, Precios, Importaciones y Catálogos maestros, con 16 casillas y Aprobar datos clave aparte', () => {
    const html = render(seeded(accessState()))
    const biblioteca = sectionOf(html, 'Biblioteca')
    for (const tab of ['Productos', 'Fichas', 'Precios', 'Importaciones', 'Catálogos maestros']) {
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

  it('Biblioteca es un solo bloque con casillas por permiso y un único botón Guardar', () => {
    const html = render(seeded(accessState()))
    const biblioteca = sectionOf(html, 'Biblioteca')

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
    expect(html).not.toContain('Complemento de Fichas')
  })

  it('Biblioteca: ninguna casilla de las pestañas viene bloqueada, vengan las acciones de donde vengan', () => {
    const html = render(seeded(accessState({
      sources: [{ id: 'sel', kind: 'template', templateId: 'biblioteca-seleccion', catalogVersion: 'test', grantedById: 'admin-1', reason: null }],
      grants: [
        { sourceId: 'sel', actionId: 'products:read', scope: 'global' },
        { sourceId: 'sel', actionId: 'products:write', scope: 'global' },
        { sourceId: 'otra-fuente', actionId: 'prices:preview', scope: 'global' },
      ],
    })))
    const biblioteca = sectionOf(html, 'Biblioteca')
    const boxes = checkboxesOf(biblioteca)
    expect(boxes.length).toBe(18 + 5)
    expect(boxes.some(isDisabled)).toBe(false)
    expect(biblioteca).toContain('Verá las pestañas: Productos, Fichas, Precios.')
  })

  it('«Publicar en tienda» es una acción más de Biblioteca, con su propia casilla y sin paquete', () => {
    const html = renderWorkspace(seeded(manualState([
      { sourceId: 'manual-1', actionId: 'products:publish', scope: 'global' },
    ])), ['Operador'])
    const biblioteca = sectionOf(html, 'Panel Biblioteca')
    expect(biblioteca).toContain('aria-label="Publicar en tienda: marcar o desmarcar todo"')
    const box = biblioteca.match(/<input[^>]*aria-label="Publicar producto"[^>]*>/)?.[0] ?? ''
    expect(box).toMatch(/\schecked(?:=|\s|\/?>)/)
    expect(isDisabled(box)).toBe(false)
    expect(biblioteca).toContain('Necesita «Editar fichas» ya guardado en la pestaña Fichas.')
    expect(html).not.toMatch(/paquete/i)
  })

  it('sin grupos de acciones habilitadas conserva el bloque de Biblioteca y omite los demás', () => {
    const html = render(seeded(accessState({ grants: [], sources: [], actions: [] })))

    expect(html).toContain('aria-label="Biblioteca"')
    expect(html).not.toContain('aria-label="Comercial"')
    expect(html).not.toContain('aria-label="Marketing y mercadeo"')
    expect(html).not.toMatch(/paquete/i)
  })

  it('expone la revocación completa de una fuente manual', () => {
    const html = render(seeded(accessState({
      sources: [{
        id: 'manual-1', kind: 'manual', templateId: null, catalogVersion: 'panels-20261019-3', grantedById: 'admin-1', reason: 'manual-assignment',
      }],
      grants: [{ sourceId: 'manual-1', actionId: 'customers:read', scope: 'own' }],
    })))

    expect(html).toContain('Retirar asignación manual')
  })

  it('bloquea guardar mientras existan accesos antiguos que este editor no muestra, y lo explica en simple', () => {
    const html = render(seeded(accessState({
      sources: [{
        id: 'manual-legacy', kind: 'manual', templateId: null, catalogVersion: 'panels-20261019-3', grantedById: 'admin-1', reason: 'manual-assignment',
      }],
      grants: [{ sourceId: 'manual-legacy', actionId: 'listas:read', scope: 'global' }],
    })))
    expect(html).toContain('Esta persona tiene accesos antiguos que este editor no muestra.')
    expect(html).toContain('Retirar asignación manual')
    expect(html).not.toMatch(/paquete/i)
  })
})

describe('UserAccessPanel — grupos del portal dentro de Comercial (una casilla por pestaña)', () => {
  const PORTAL_ACTIONS = [
    { id: 'portalAccounts:read', label: 'Ver cuentas del portal', purpose: 'Ver cuentas web', allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true },
    { id: 'portalAccounts:manage', label: 'Gestionar cuentas del portal', purpose: 'Vincular y activar cuentas', allowedScopes: ['own', 'team', 'global'], dependencies: ['portalAccounts:read'], enabled: true },
    { id: 'portalAccounts:assign', label: 'Asignar asesor del portal', purpose: 'Asignar asesor', allowedScopes: ['team', 'global'], dependencies: ['portalAccounts:read'], enabled: true },
    { id: 'portalZones:manage', label: 'Gestionar zonas de asesores', purpose: 'Administrar zonas', allowedScopes: ['global'], dependencies: ['portalAccounts:read'], enabled: true },
  ]
  const manualSource = { id: 'manual-portal', kind: 'manual' as const, templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null }

  function portalState(grants: { actionId: string; scope: string }[] = []) {
    const base = accessState()
    return accessState({
      sources: grants.length ? [manualSource] : [],
      grants: grants.map((grant) => ({ sourceId: manualSource.id, ...grant })) as UserAccessState['grants'],
      actions: [...(base.actions ?? []), ...PORTAL_ACTIONS] as UserAccessState['actions'],
    })
  }

  const inputOf = (html: string, label: string) => html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ''
  const isChecked = (html: string, label: string) => /\schecked(?:=|\s|\/?>)/.test(inputOf(html, label))

  it('ya no hay un panel «Clientes del portal»: los grupos Solicitudes del portal y Zonas viven en Comercial', () => {
    const html = renderWorkspace(seeded(portalState()), ['Operador'])
    const panel = sectionOf(html, 'Comercial')

    expect(html).not.toContain('<span>Clientes del portal</span>')
    expect(sectionOf(html, 'Clientes del portal')).toBe('')
    for (const group of ['Solicitudes del portal', 'Zonas']) {
      expect(panel).toContain(`aria-label="${group}: marcar o desmarcar todo"`)
    }
    for (const label of ['Ver cuentas del portal', 'Gestionar cuentas del portal', 'Asignar asesor del portal', 'Gestionar zonas de asesores']) {
      expect(inputOf(panel, label)).not.toBe('')
    }
    expect(panel).toContain('Asignar asesor permite repartir las que aún no tienen uno')
    expect(panel).toContain('Administrar las zonas que reparten los registros nuevos entre asesores')
    expect(panel).not.toMatch(/ACL|scope|@Roles/i)
  })

  it('Zonas se asigna como una acción más de Comercial, sin ningún paquete', () => {
    const html = render(seeded(portalState()))
    const commercial = sectionOf(html, 'Comercial')

    expect(commercial).toContain('aria-label="Gestionar zonas de asesores"')
    expect(commercial).not.toMatch(/paquete/i)
    expect(isDisabled(inputOf(commercial, 'Gestionar zonas de asesores'))).toBe(false)
  })

  it('solo Zonas no marca Asignar asesor ni Gestionar cuentas', () => {
    const html = render(seeded(portalState([
      { actionId: 'portalAccounts:read', scope: 'global' },
      { actionId: 'portalZones:manage', scope: 'global' },
    ])))

    expect(isChecked(html, 'Gestionar zonas de asesores')).toBe(true)
    expect(isChecked(html, 'Ver cuentas del portal')).toBe(true)
    expect(isChecked(html, 'Asignar asesor del portal')).toBe(false)
    expect(isChecked(html, 'Gestionar cuentas del portal')).toBe(false)
  })

  it('solo Asignar asesor no marca Zonas ni Gestionar cuentas', () => {
    const html = render(seeded(portalState([
      { actionId: 'portalAccounts:read', scope: 'team' },
      { actionId: 'portalAccounts:assign', scope: 'team' },
    ])))

    expect(isChecked(html, 'Asignar asesor del portal')).toBe(true)
    expect(isChecked(html, 'Gestionar zonas de asesores')).toBe(false)
    expect(isChecked(html, 'Gestionar cuentas del portal')).toBe(false)
  })

  it('sin concesiones ninguna casilla del portal viene marcada', () => {
    const html = render(seeded(portalState()))

    for (const label of ['Ver cuentas del portal', 'Gestionar cuentas del portal', 'Asignar asesor del portal', 'Gestionar zonas de asesores']) {
      expect(isChecked(html, label)).toBe(false)
    }
  })

  it('los alcances ofrecidos son exactamente los del catálogo', () => {
    const html = render(seeded(portalState([
      { actionId: 'portalAccounts:read', scope: 'own' },
      { actionId: 'portalAccounts:assign', scope: 'team' },
      { actionId: 'portalZones:manage', scope: 'global' },
    ])))
    const optionsOf = (actionId: string) => [...(html.match(new RegExp(`<select[^>]*aria-label="Alcance ${actionId}"[^>]*>(.*?)</select>`))?.[1] ?? '').matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1])

    expect(optionsOf('portalAccounts:read')).toEqual(['Propio', 'Equipo', 'Global'])
    expect(optionsOf('portalAccounts:assign')).toEqual(['Equipo', 'Global'])
    expect(optionsOf('portalZones:manage')).toEqual(['Global'])
  })

  it('con un catálogo sin acciones del portal no pinta los grupos', () => {
    const html = render(seeded(accessState()))
    expect(html).not.toContain('Solicitudes del portal')
    expect(html).not.toContain('Gestionar zonas de asesores')
  })
})

describe('UserAccessPanel — acciones que antes dependían solo del cargo', () => {
  const ACTIONS = [
    { id: 'portalAccounts:read', label: 'Ver cuentas del portal', purpose: 'Ver cuentas web', allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true },
    { id: 'audit:read', label: 'Consultar auditoría', purpose: 'Ver el registro', allowedScopes: ['global'], dependencies: [], enabled: true },
    { id: 'salesOrders:read', label: 'Consultar pedidos', purpose: 'Ver pedidos', allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true },
    { id: 'salesOrders:invoice', label: 'Registrar factura del pedido', purpose: 'Anotar factura', allowedScopes: ['own', 'team', 'global'], dependencies: ['salesOrders:read'], enabled: true },
    { id: 'storefront:manage', label: 'Gestionar la tienda web', purpose: 'Administrar la tienda', allowedScopes: ['global'], dependencies: [], enabled: true },
    { id: 'portalTariffs:manage', label: 'Gestionar tarifa general y niveles', purpose: 'Tarifa y niveles', allowedScopes: ['global'], dependencies: ['portalAccounts:read'], enabled: true },
  ]
  const manualSource = { id: 'manual-extra', kind: 'manual' as const, templateId: null, catalogVersion: 'test', grantedById: 'admin-1', reason: null }
  const state = (grants: { actionId: string; scope: string }[] = []) => accessState({
    sources: grants.length ? [manualSource] : [],
    grants: grants.map((grant) => ({ sourceId: manualSource.id, ...grant })) as UserAccessState['grants'],
    actions: [...(accessState().actions ?? []), ...ACTIONS] as UserAccessState['actions'],
  })
  const inputOf = (html: string, label: string) => html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ''
  const isChecked = (html: string, label: string) => /\schecked(?:=|\s|\/?>)/.test(inputOf(html, label))

  it('Auditoría, Pedidos, Tienda web y Tarifa general y niveles son grupos de Comercial, con ayuda en lenguaje simple', () => {
    const panel = sectionOf(renderWorkspace(seeded(state()), ['Operador']), 'Comercial')

    for (const group of ['Auditoría', 'Pedidos', 'Tienda web', 'Tarifa general y niveles']) {
      expect(panel).toContain(`aria-label="${group}: marcar o desmarcar todo"`)
    }
    for (const label of ['Consultar auditoría', 'Consultar pedidos', 'Registrar factura del pedido', 'Gestionar la tienda web', 'Gestionar tarifa general y niveles']) {
      expect(inputOf(panel, label)).not.toBe('')
    }
    expect(panel).toContain('Ver el registro de quién cambió qué')
    expect(panel).toContain('Elegir la tarifa general de la tienda')
    expect(panel).not.toMatch(/ACL|scope|@Roles/i)
  })

  it('sin concesiones ninguna de las cinco casillas viene marcada', () => {
    const html = render(seeded(state()))
    for (const label of ['Consultar auditoría', 'Consultar pedidos', 'Registrar factura del pedido', 'Gestionar la tienda web', 'Gestionar tarifa general y niveles']) {
      expect(isChecked(html, label)).toBe(false)
    }
  })

  it('los alcances ofrecidos son los del catálogo: pedidos propio/equipo/global, el resto solo global', () => {
    const html = render(seeded(state([
      { actionId: 'audit:read', scope: 'global' },
      { actionId: 'salesOrders:read', scope: 'own' },
      { actionId: 'salesOrders:invoice', scope: 'own' },
      { actionId: 'storefront:manage', scope: 'global' },
      { actionId: 'portalAccounts:read', scope: 'global' },
      { actionId: 'portalTariffs:manage', scope: 'global' },
    ])))
    const optionsOf = (actionId: string) => [...(html.match(new RegExp(`<select[^>]*aria-label="Alcance ${actionId}"[^>]*>(.*?)</select>`))?.[1] ?? '').matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1])

    expect(optionsOf('salesOrders:read')).toEqual(['Propio', 'Equipo', 'Global'])
    expect(optionsOf('salesOrders:invoice')).toEqual(['Propio', 'Equipo', 'Global'])
    for (const id of ['audit:read', 'storefront:manage', 'portalTariffs:manage']) expect(optionsOf(id)).toEqual(['Global'])
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
  it('ofrece elegir usuario antes de mostrar sus accesos', () => {
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
    expect(html).not.toContain('Guardar acciones individuales')
  })

  it('con ?usuario= monta el panel de ese usuario y sus acciones, sin paquetes', () => {
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
    expect(html).toContain('Guardar acciones individuales')
    expect(html).not.toMatch(/paquete/i)
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
    expect(html).not.toContain('Guardar acciones individuales')
    expect(html).not.toContain('Buscar usuario')
  })
})
