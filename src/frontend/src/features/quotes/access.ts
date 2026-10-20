import { ROLES } from '../../lib/roles'

/**
 * Criterio de visibilidad del editor de DESCUENTO por línea (COM-03
 * frontend). MISMO patrón que `features/customers/access.ts` y
 * `features/users/access.ts`: una función pura decide qué se OFRECE en la
 * interfaz; el servidor sigue siendo la autoridad — resuelve
 * `quotes:discount` con `resolveAccess` por petición y responde 403 con su
 * mensaje, que la UI pinta tal cual.
 *
 * Criterio MÍNIMO documentado: hoy el único rol que `resolveAccess` exime
 * sin concesión es Super Admin (data-scope.ts, EXCEPCIÓN 1) y `quotes:discount`
 * no la recibe NADIE por defecto — ningún paquete la asigna (decisión F1
 * pendiente del coordinador). Ofrecer el editor a quien el servidor rechazará
 * sería una promesa falsa; por eso el resto de roles ve el descuento SOLO
 * LECTURA (junto al gate de estado que ya existía).
 *
 * PUNTO DE EXTENSIÓN (D5/E6/F1): cuando el navegador reciba concesiones,
 * esta función las recibe como segundo argumento y `canEditDiscount` pasa a
 * leer `quotes:discount` con su alcance; QuoteDetailPage solo consume esta
 * clave, así que el cambio se queda aquí.
 */
export interface QuotesAccess {
  /** Editor inline de «Dto. %» en QuoteItemsTable; el 403 del servidor manda. */
  readonly canEditDiscount: boolean
}

export function quotesAccess(
  user?: { roles?: readonly string[] | null } | null
): QuotesAccess {
  const roles = user?.roles ?? []
  return { canEditDiscount: roles.includes(ROLES.SUPER_ADMIN) }
}
