import type { UserAccessState } from '../../services/users.service'

/**
 * Casillas de Biblioteca por pestaña (Productos / Fichas / Precios / Importaciones / Catálogos maestros).
 *
 * Lógica pura y sin pantalla. Espejo de las dependencias de `access-catalog.ts`
 * del servidor; el servidor las vuelve a calcular y es la autoridad, aquí solo
 * sirven para que la persona vea qué se marcará o desmarcará junto.
 */

export const LIBRARY_SELECTION_SOURCE_ID = 'biblioteca-seleccion'
export const LIBRARY_COMPLEMENT_SOURCE_ID = 'biblioteca-publicacion'

export type LibraryTabId = 'productos' | 'fichas' | 'precios' | 'importaciones' | 'maestros'

export interface LibraryCheckbox {
  readonly actionId: string
  readonly label: string
}

export interface LibraryTabDefinition {
  readonly id: LibraryTabId
  readonly label: string
  readonly hint: string
  /** Acción que abre la pestaña para la persona. */
  readonly opensWith: string
  readonly items: readonly LibraryCheckbox[]
}

export const LIBRARY_TABS: readonly LibraryTabDefinition[] = Object.freeze([
  {
    id: 'productos',
    label: 'Productos',
    hint: 'Buscar y consultar productos.',
    opensWith: 'products:read',
    items: [
      { actionId: 'products:read', label: 'Ver productos' },
      { actionId: 'prices:read', label: 'Ver precios' },
    ],
  },
  {
    id: 'fichas',
    label: 'Fichas',
    hint: 'Completar y mantener las fichas.',
    opensWith: 'products:write',
    items: [
      { actionId: 'products:read', label: 'Ver fichas' },
      { actionId: 'products:write', label: 'Editar fichas' },
      { actionId: 'products:validate', label: 'Validar ficha' },
      { actionId: 'products:notes', label: 'Notas internas' },
      { actionId: 'products:delete', label: 'Eliminar producto' },
    ],
  },
  {
    id: 'precios',
    label: 'Precios',
    hint: 'Revisar archivos de precios y aplicarlos.',
    opensWith: 'prices:preview',
    items: [
      { actionId: 'prices:read', label: 'Ver precios' },
      { actionId: 'prices:preview', label: 'Revisar archivo de precios' },
      { actionId: 'prices:save', label: 'Guardar revisión' },
      { actionId: 'prices:apply', label: 'Aplicar precios' },
      { actionId: 'providers:read', label: 'Ver perfiles de proveedor' },
      { actionId: 'providers:write', label: 'Editar perfiles de proveedor' },
    ],
  },
  {
    id: 'importaciones',
    label: 'Importaciones',
    hint: 'Cargar productos y datos desde un archivo. Necesita poder editar fichas.',
    opensWith: 'imports:read',
    items: [
      { actionId: 'imports:read', label: 'Ver importaciones' },
      { actionId: 'imports:run', label: 'Importar datos' },
    ],
  },
  {
    id: 'maestros',
    label: 'Catálogos maestros',
    hint: 'Mantener categorías, marcas, tarifas y diccionario.',
    opensWith: 'masters:read',
    items: [
      { actionId: 'masters:read', label: 'Ver catálogos maestros' },
      { actionId: 'masters:write', label: 'Editar catálogos maestros' },
      { actionId: 'products:approveSpecs', label: 'Aprobar datos clave (requiere poder editar fichas)' },
    ],
  },
])

/** Las 16 acciones que pueden marcarse (products:publish NO: es un complemento aparte). */
export const LIBRARY_SELECTION_ACTION_IDS: readonly string[] = Object.freeze(
  [...new Set(LIBRARY_TABS.flatMap((tab) => tab.items.map((item) => item.actionId)))],
)

const DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'products:write': ['products:read'],
  'products:validate': ['products:read'],
  'products:notes': ['products:read'],
  'products:delete': ['products:read'],
  'prices:preview': ['prices:read'],
  'prices:save': ['prices:preview'],
  'prices:apply': ['prices:read'],
  'providers:write': ['providers:read'],
  'imports:read': ['products:read'],
  'imports:run': ['imports:read', 'products:write'],
  'masters:read': ['products:read'],
  'masters:write': ['masters:read'],
  'products:approveSpecs': ['products:read', 'products:write'],
})

export type LibrarySelection = ReadonlySet<string>

/** Marca la acción y, de forma transitiva, todo aquello de lo que depende. */
export function closeSelection(actionIds: Iterable<string>): Set<string> {
  const closed = new Set<string>()
  const visit = (id: string): void => {
    if (closed.has(id) || !LIBRARY_SELECTION_ACTION_IDS.includes(id)) return
    closed.add(id)
    for (const dependency of DEPENDENCIES[id] ?? []) visit(dependency)
  }
  for (const id of actionIds) visit(id)
  return closed
}

/** Marcar una casilla marca también sus dependencias. */
export function checkAction(selection: LibrarySelection, actionId: string): Set<string> {
  return closeSelection([...selection, actionId])
}

/** Acciones que dependen (directa o indirectamente) de `actionId`. */
function dependentsOf(actionId: string): string[] {
  const found = new Set<string>()
  const visit = (target: string): void => {
    for (const [id, deps] of Object.entries(DEPENDENCIES)) {
      if (deps.includes(target) && !found.has(id)) {
        found.add(id)
        visit(id)
      }
    }
  }
  visit(actionId)
  return [...found]
}

/** Desmarcar una casilla desmarca también todo lo que dependa de ella. */
export function uncheckAction(selection: LibrarySelection, actionId: string): Set<string> {
  const removed = new Set([actionId, ...dependentsOf(actionId)])
  return new Set([...selection].filter((id) => !removed.has(id)))
}

export function tabActionIds(tab: LibraryTabDefinition): string[] {
  return [...new Set(tab.items.map((item) => item.actionId))]
}

export type TabState = 'all' | 'some' | 'none'

export function tabState(selection: LibrarySelection, tab: LibraryTabDefinition): TabState {
  const ids = tabActionIds(tab)
  const marked = ids.filter((id) => selection.has(id)).length
  return marked === 0 ? 'none' : marked === ids.length ? 'all' : 'some'
}

/**
 * Casilla de la pestaña: marca todas las suyas (y sus dependencias) o, al
 * desmarcar, quita las suyas. Una casilla compartida con otra pestaña que está
 * completa se conserva (así quitar Fichas no deja sin «Ver productos» a quien
 * tiene Productos completo), y siempre se respeta lo que otra casilla marcada
 * aún necesita.
 */
export function toggleTab(selection: LibrarySelection, tab: LibraryTabDefinition): Set<string> {
  const ids = tabActionIds(tab)
  if (tabState(selection, tab) !== 'all') return closeSelection([...selection, ...ids])
  const keptByOtherTab = new Set(
    LIBRARY_TABS.filter((other) => other.id !== tab.id && tabState(selection, other) === 'all').flatMap(tabActionIds),
  )
  const removed = ids.filter((id) => !keptByOtherTab.has(id))
  return closeSelection([...selection].filter((id) => !removed.includes(id)))
}

/** Pestañas que la persona verá con esta selección (Productos=ver, Fichas=editar, Precios=revisar). */
export function visibleTabs(selection: LibrarySelection): LibraryTabDefinition[] {
  return LIBRARY_TABS.filter((tab) => selection.has(tab.opensWith))
}

/**
 * Estado inicial de las casillas: lo que la persona ya tiene de Biblioteca con
 * alcance global, vengan de paquetes, de una selección anterior o de una
 * asignación manual. El complemento «Publicar en tienda» no cuenta: se
 * conserva aparte.
 */
export function initialSelection(access: Pick<UserAccessState, 'grants' | 'sources'> | undefined): Set<string> {
  if (!access) return new Set()
  const complementSourceIds = new Set(
    access.sources.filter((source) => source.templateId === LIBRARY_COMPLEMENT_SOURCE_ID).map((source) => source.id),
  )
  return new Set(
    access.grants
      .filter((grant) =>
        grant.scope === 'global' &&
        LIBRARY_SELECTION_ACTION_IDS.includes(grant.actionId) &&
        !complementSourceIds.has(grant.sourceId),
      )
      .map((grant) => grant.actionId),
  )
}

/** Hay «Publicar en tienda» asignado: necesita poder editar fichas. */
export function hasPublicationComplement(access: Pick<UserAccessState, 'sources'> | undefined): boolean {
  return Boolean(access?.sources.some((source) => source.templateId === LIBRARY_COMPLEMENT_SOURCE_ID))
}

export const PUBLICATION_NEEDS_EDIT_MESSAGE = 'Quita primero Publicar en tienda: necesita poder editar fichas.'

/** Orden estable de las acciones para enviar al servidor. */
export function selectionToActionIds(selection: LibrarySelection): string[] {
  return LIBRARY_SELECTION_ACTION_IDS.filter((id) => selection.has(id))
}

export function sameSelection(a: LibrarySelection, b: LibrarySelection): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

export interface SelectionChanges {
  readonly added: string[]
  readonly removed: string[]
}

export function selectionChanges(before: LibrarySelection, after: LibrarySelection): SelectionChanges {
  return {
    added: selectionToActionIds(after).filter((id) => !before.has(id)),
    removed: selectionToActionIds(before).filter((id) => !after.has(id)),
  }
}

/** Nombre simple de cada acción para el resumen (el primero que la nombra). */
export function actionDisplayName(actionId: string): string {
  const preferred: Record<string, string> = { 'products:read': 'Ver productos', 'prices:read': 'Ver precios' }
  if (preferred[actionId]) return preferred[actionId]
  for (const tab of LIBRARY_TABS) {
    const item = tab.items.find((entry) => entry.actionId === actionId)
    if (item) return item.label
  }
  return actionId
}
