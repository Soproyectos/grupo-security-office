import { ROLES } from '../../lib/roles'

/**
 * Criterio de visibilidad de las acciones de cartera (COM-02 frontend).
 *
 * MISMO patrón que `features/agenda/agenda-access.ts` y
 * `features/users/access.ts`: una función pura decide qué se OFRECE en la
 * interfaz; el servidor sigue siendo la autoridad del alcance y de los datos
 * por petición (`resolveAccess` + `scopeWhere` en backend).
 *
 * HOY el criterio es el ROL de gestión de cartera — el mismo que ya decidía
 * la columna «Responsable» (`CustomersPage` antes de este incremento). NO se
 * añade ningún gating de edición por pertenencia: la fila que el servidor
 * devuelve se pinta completa y si la escritura no está concedida el servidor
 * responde 403 con su mensaje, que la UI pinta (aceptación 2: «lectura equipo
 * no concede editar equipo» se cumple en servidor, no se simula en cliente).
 *
 * PUNTO DE EXTENSIÓN (D5/E6/F3, decisión del coordinador): cuando el
 * navegador reciba concesiones, esta función las recibe como segundo
 * argumento y `canReassign` pasa a leer `customers:reassign` (y la columna
 * `customers:read` con su alcance). La página solo consume estas dos claves,
 * así que el cambio se queda aquí.
 */
export const REASSIGN_ROLES: readonly string[] = [
  ROLES.SUPER_ADMIN,
  ROLES.SUPERVISOR,
  ROLES.ADMIN_COMERCIAL,
]

export interface CustomersAccess {
  /** Columna «Responsable» y su directorio de nombres. */
  readonly showOwnerColumn: boolean
  /** Botón «Reasignar» en la fila; el 403 del servidor manda si no hay grant. */
  readonly canReassign: boolean
}

export function customersAccess(
  user?: { roles?: readonly string[] | null } | null,
  personal = false
): CustomersAccess {
  const roles = user?.roles ?? []
  const managesPortfolio = !personal && REASSIGN_ROLES.some((role) => roles.includes(role))
  return { showOwnerColumn: managesPortfolio, canReassign: managesPortfolio }
}
