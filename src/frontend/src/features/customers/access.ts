/**
 * Visibilidad de las acciones de cartera de clientes.
 *
 * Decide por la ACCIÓN ASIGNADA (`customers:reassign`), nunca por el rol: a quien se le asigna, se le muestra
 * (Super Admin ve todo, lo resuelve `hasAssignedAction`). El servidor sigue siendo la autoridad del alcance y
 * responde 403 con su mensaje si la escritura no está concedida.
 */
export interface CustomersAccess {
  /** Columna «Responsable» y su directorio de nombres. */
  readonly showOwnerColumn: boolean
  /** Botón «Reasignar» en la fila; el 403 del servidor manda si no hay grant. */
  readonly canReassign: boolean
}

/** `canReassignGranted`: la persona tiene la acción `customers:reassign` (o es Super Admin). `personal` = vista de mi cartera. */
export function customersAccess(canReassignGranted: boolean, personal = false): CustomersAccess {
  const managesPortfolio = !personal && canReassignGranted
  return { showOwnerColumn: managesPortfolio, canReassign: managesPortfolio }
}
