import { blocksInPack } from '../../dashboard/registry/blocks'
import { blockPermission, packPermission, type PackId } from '../../dashboard/registry/types'

/**
 * Lógica de selección de la pantalla de concesiones por usuario.
 *
 * Vive aquí y no dentro de `DashboardGrants.tsx` por una razón práctica: el repo
 * no tiene entorno DOM ni `@testing-library`, así que los specs no pueden montar
 * el componente y pulsar sus casillas. Funciones puras sí se pueden probar, y el
 * caso crítico —que guardar los paneles no borre la concesión de tienda— no se
 * puede cubrir de otra forma.
 *
 * Todas reciben la selección actual y devuelven una nueva: el endpoint
 * `PUT /users/:id/dashboard-permissions` sustituye el conjunto en bloque, así
 * que el estado es "todo lo que se va a enviar", sin distinguir familias.
 */

/** Concesiones guardadas, sin filtrar por familia. */
export function selectionFromGrants(grants: { permission: string }[]): Set<string> {
  return new Set(grants.map((g) => g.permission))
}

/** Estado de la casilla del paquete, contando paquete completo y piezas. */
export function packSelectionState(selected: Set<string>, packId: PackId) {
  if (selected.has(packPermission(packId))) {
    return { state: 'all' as const, count: blocksInPack(packId).length }
  }

  const count = blocksInPack(packId).filter((b) => selected.has(blockPermission(b.id))).length

  return {
    state: count === 0 ? ('none' as const) : ('partial' as const),
    count,
  }
}

/** Marca o desmarca un paquete sin tocar las concesiones de otras familias. */
export function togglePackInSelection(selected: Set<string>, packId: PackId): Set<string> {
  const next = new Set(selected)
  const { state } = packSelectionState(next, packId)

  // Al marcar el paquete se limpian sus piezas sueltas: conservarlas sería
  // redundante y haría que al desmarcar el paquete quedaran restos.
  blocksInPack(packId).forEach((b) => next.delete(blockPermission(b.id)))

  if (state === 'all') {
    next.delete(packPermission(packId))
  } else {
    next.add(packPermission(packId))
  }

  return next
}

/** Marca o desmarca una pieza, conservando el resto de la selección. */
export function toggleBlockInSelection(
  selected: Set<string>,
  packId: PackId,
  blockId: string,
): Set<string> {
  const next = new Set(selected)

  // Tocar una pieza degrada el paquete a piezas: se expande a sus bloques
  // y se quita el permiso de paquete, para que lo guardado refleje la
  // selección exacta y no crezca sola.
  if (next.has(packPermission(packId))) {
    next.delete(packPermission(packId))
    blocksInPack(packId).forEach((b) => next.add(blockPermission(b.id)))
  }

  const perm = blockPermission(blockId)
  if (next.has(perm)) {
    next.delete(perm)
  } else {
    next.add(perm)
  }

  return next
}

/** Marca o desmarca un permiso suelto, conservando el resto de la selección. */
export function togglePermissionInSelection(selected: Set<string>, permission: string): Set<string> {
  const next = new Set(selected)
  if (next.has(permission)) {
    next.delete(permission)
  } else {
    next.add(permission)
  }

  return next
}
