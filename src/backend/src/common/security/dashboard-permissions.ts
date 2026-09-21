/**
 * Paquetes de bloques del dashboard y su asignación por rol.
 *
 * El catálogo de bloques vive en el frontend
 * (`features/dashboard/registry/blocks.ts`), porque es donde se renderizan.
 * Aquí sólo viven los **paquetes**, que son lo que se concede: el backend no
 * necesita saber qué bloques contiene cada uno para validar un permiso, y
 * duplicar las 49 entradas obligaría a mantenerlas sincronizadas a mano.
 *
 * Los permisos individuales `dashboard:block:<id>` existen igualmente y se
 * conceden por usuario (fase 5); no se asignan a roles.
 */

export const DASHBOARD_PACKS = [
  'ventas',
  'cotizaciones',
  'clientes',
  'catalogo',
  'listas',
  'publicacion',
  'usuarios',
  'auditoria',
  'operacion',
] as const;

export type DashboardPack = (typeof DASHBOARD_PACKS)[number];

export function dashboardPackPermission(pack: DashboardPack): string {
  return `dashboard:pack:${pack}`;
}

export function dashboardBlockPermission(blockId: string): string {
  return `dashboard:block:${blockId}`;
}

/**
 * Qué paquetes trae cada rol por defecto.
 *
 * Es el "piso" del rol: las concesiones individuales sólo suman sobre esto
 * (fase 5). Super Admin no aparece porque el `PermissionsGuard` lo deja pasar
 * por excepción (BE-RBAC-001) y el compositor del frontend replica esa regla;
 * aun así se le conceden todos, para que su JWT sea coherente con lo que ve.
 */
export const ROLE_DASHBOARD_PACKS: Record<string, DashboardPack[]> = {
  'Super Admin': [...DASHBOARD_PACKS],
  Supervisor: ['ventas', 'cotizaciones', 'clientes', 'usuarios', 'auditoria'],
  'Admin Comercial': [
    'catalogo',
    'listas',
    'publicacion',
    'usuarios',
    'auditoria',
  ],
  Vendedor: ['ventas', 'cotizaciones', 'clientes', 'catalogo'],
  // Operador está en reserva: conserva su paquete para cuando se retome, pero
  // hoy no hay usuarios con ese rol.
  Operador: ['operacion', 'catalogo'],
  Consulta: ['catalogo', 'listas'],
};

/** Permisos de dashboard de un rol, listos para el seed. */
export function dashboardPermissionsForRole(roleName: string): string[] {
  return (ROLE_DASHBOARD_PACKS[roleName] ?? []).map(dashboardPackPermission);
}
