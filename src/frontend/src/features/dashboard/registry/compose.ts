import { DASHBOARD_BLOCKS, blocksInPack } from './blocks'
import {
  SCOPE_RANK,
  blockPermission,
  packPermission,
  type DashboardBlock,
  type PackId,
} from './types'

/**
 * Rol con acceso total por excepción.
 *
 * Replica la excepción del `PermissionsGuard` del backend (BE-RBAC-001): un
 * Super Admin pasa los guards sin evaluar su lista de permisos. Si el
 * compositor no hiciera lo mismo, tendríamos un Super Admin capaz de pedir los
 * datos por API pero incapaz de ver el bloque que los muestra.
 */
const SUPER_ADMIN_ROLE = 'Super Admin'

export interface ComposeInput {
  roles: string[]
  permissions: string[]
}

export interface ComposedDashboard {
  kpis: DashboardBlock[]
  panels: DashboardBlock[]
  /** Bloques permitidos que aún no tienen componente. Útil en desarrollo. */
  pendingBlocks: DashboardBlock[]
  isEmpty: boolean
}

/**
 * Expande los permisos concedidos al conjunto de ids de bloque visibles.
 *
 * Un `dashboard:pack:<id>` habilita todos los bloques de ese paquete; un
 * `dashboard:block:<id>` habilita sólo ese. Ambos conviven: el paquete crece
 * solo cuando se añaden bloques nuevos al catálogo, mientras que las piezas
 * sueltas quedan congeladas — que es justo la diferencia que el administrador
 * expresó al conceder una u otra cosa.
 */
export function resolveVisibleBlockIds(input: ComposeInput): Set<string> {
  if (input.roles.includes(SUPER_ADMIN_ROLE)) {
    return new Set(DASHBOARD_BLOCKS.map((b) => b.id))
  }

  const granted = new Set(input.permissions)
  const visible = new Set<string>()

  for (const { id } of DASHBOARD_BLOCKS) {
    if (granted.has(blockPermission(id))) visible.add(id)
  }

  for (const packId of new Set(DASHBOARD_BLOCKS.map((b) => b.pack))) {
    if (!granted.has(packPermission(packId))) continue

    for (const block of blocksInPack(packId)) visible.add(block.id)
  }

  return visible
}

/**
 * Deduplica por `id` conservando el alcance más amplio.
 *
 * El catálogo puede declarar el mismo bloque con distintos alcances (el mismo
 * "Mejores clientes" para Vendedor y para Supervisor). Un usuario con ambos
 * roles debe ver uno solo: el más amplio que tenga permitido.
 */
function dedupeByWidestScope(blocks: DashboardBlock[]): DashboardBlock[] {
  const best = new Map<string, DashboardBlock>()

  for (const block of blocks) {
    const current = best.get(block.id)

    if (!current || SCOPE_RANK[block.scope] > SCOPE_RANK[current.scope]) {
      best.set(block.id, block)
    }
  }

  return [...best.values()]
}

/**
 * Compone el dashboard de un usuario a partir de sus roles y permisos.
 *
 * Es una función pura: no toca la red, ni el store, ni React. Toda la lógica de
 * visibilidad vive aquí y se prueba sin montar nada.
 */
export function composeDashboard(input: ComposeInput): ComposedDashboard {
  const visibleIds = resolveVisibleBlockIds(input)

  const visible = dedupeByWidestScope(
    DASHBOARD_BLOCKS.filter((b) => visibleIds.has(b.id)),
  ).sort((a, b) => a.order - b.order)

  const implemented = visible.filter((b) => b.component)

  return {
    kpis: implemented.filter((b) => b.kind === 'kpi'),
    panels: implemented.filter((b) => b.kind === 'panel'),
    pendingBlocks: visible.filter((b) => !b.component),
    // "Vacío" se juzga sobre lo que el usuario tiene permitido, no sobre lo que
    // está implementado: a quien no se le concedió nada hay que explicárselo,
    // mientras que un bloque pendiente es un hueco temporal del desarrollo.
    isEmpty: visible.length === 0,
  }
}

/**
 * Estado de la casilla de un paquete para la pantalla de concesiones:
 * vacía, parcial (algunos bloques) o completa.
 */
export interface PackSelectionState {
  packId: PackId
  total: number
  selected: number
  state: 'none' | 'partial' | 'all'
}

export function packSelectionState(
  packId: PackId,
  selectedBlockIds: Set<string>,
): PackSelectionState {
  const blocks = blocksInPack(packId)
  const selected = blocks.filter((b) => selectedBlockIds.has(b.id)).length

  return {
    packId,
    total: blocks.length,
    selected,
    state: selected === 0 ? 'none' : selected === blocks.length ? 'all' : 'partial',
  }
}
