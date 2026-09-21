/**
 * Nombres canónicos de los roles del sistema. Fuente única de verdad.
 *
 * Motivo: los controladores enumeraban los roles como literales sueltos, de
 * modo que crear el rol *Vendedor* obligó a editar a mano 21 endpoints en 7
 * archivos. Olvidar uno no rompe nada visible — simplemente ese rol recibe un
 * 403 en un sitio concreto, que es la clase de fallo que se descubre tarde y en
 * producción.
 */
export const ROLE = {
  SUPER_ADMIN: 'Super Admin',
  SUPERVISOR: 'Supervisor',
  ADMIN_COMERCIAL: 'Admin Comercial',
  VENDEDOR: 'Vendedor',
  OPERADOR: 'Operador',
  CONSULTA: 'Consulta',
} as const;

export type RoleName = (typeof ROLE)[keyof typeof ROLE];

/**
 * Todos los roles. Se usa en endpoints abiertos a cualquier usuario con rol
 * asignado, típicamente lecturas acotadas al propio usuario en el servidor.
 *
 * Un rol nuevo entra aquí y queda cubierto en todos esos endpoints a la vez.
 */
export const ALL_ROLES: RoleName[] = [
  ROLE.SUPER_ADMIN,
  ROLE.SUPERVISOR,
  ROLE.ADMIN_COMERCIAL,
  ROLE.VENDEDOR,
  ROLE.OPERADOR,
  ROLE.CONSULTA,
];

/**
 * Roles que participan del ciclo comercial (cotizaciones, clientes, pedidos).
 * *Operador* queda fuera a propósito: está en reserva y cedió esa función a
 * *Vendedor*.
 */
export const COMMERCIAL_READ_ROLES: RoleName[] = [
  ROLE.SUPER_ADMIN,
  ROLE.SUPERVISOR,
  ROLE.ADMIN_COMERCIAL,
  ROLE.VENDEDOR,
  ROLE.CONSULTA,
];

export const COMMERCIAL_WRITE_ROLES: RoleName[] = [
  ROLE.SUPER_ADMIN,
  ROLE.SUPERVISOR,
  ROLE.ADMIN_COMERCIAL,
  ROLE.VENDEDOR,
];
