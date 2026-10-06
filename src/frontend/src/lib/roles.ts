import { hasAnyRole } from './rbac'

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  SUPERVISOR: 'Supervisor',
  ADMIN_COMERCIAL: 'Admin Comercial',
  VENDEDOR: 'Vendedor',
  OPERADOR: 'Operador',
  CONSULTA: 'Consulta',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES: RoleName[] = [
  ROLES.SUPER_ADMIN,
  ROLES.SUPERVISOR,
  ROLES.ADMIN_COMERCIAL,
  ROLES.VENDEDOR,
  ROLES.OPERADOR,
  ROLES.CONSULTA,
]

export const DASHBOARD_SECTIONS = {
  KPIS: 'kpis',
  PENDIENTES: 'pendientes',
  PUBLICACION: 'publicacion',
  ULTIMOS_PRODUCTOS: 'ultimosProductos',
  USUARIOS: 'usuarios',
  AUDITORIA: 'auditoria',
  CATALOGO: 'catalogo',
} as const

export type DashboardSection =
  (typeof DASHBOARD_SECTIONS)[keyof typeof DASHBOARD_SECTIONS]

export const DASHBOARD_SECTION_ROLES: Record<DashboardSection, RoleName[]> = {
  [DASHBOARD_SECTIONS.KPIS]: [
    ROLES.SUPER_ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ADMIN_COMERCIAL,
    ROLES.OPERADOR,
    ROLES.CONSULTA,
  ],
  [DASHBOARD_SECTIONS.PENDIENTES]: [
    ROLES.SUPER_ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ADMIN_COMERCIAL,
  ],
  [DASHBOARD_SECTIONS.PUBLICACION]: [ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  [DASHBOARD_SECTIONS.ULTIMOS_PRODUCTOS]: [
    ROLES.SUPER_ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ADMIN_COMERCIAL,
    ROLES.OPERADOR,
    ROLES.CONSULTA,
  ],
  [DASHBOARD_SECTIONS.USUARIOS]: [ROLES.SUPER_ADMIN, ROLES.ADMIN_COMERCIAL],
  [DASHBOARD_SECTIONS.AUDITORIA]: [
    ROLES.SUPER_ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ADMIN_COMERCIAL,
  ],
  [DASHBOARD_SECTIONS.CATALOGO]: [
    ROLES.SUPER_ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ADMIN_COMERCIAL,
    ROLES.OPERADOR,
    ROLES.CONSULTA,
  ],
}

export function canViewDashboardSection(section: DashboardSection): boolean {
  return hasAnyRole(DASHBOARD_SECTION_ROLES[section])
}

export function getVisibleSections(roles: string[]): DashboardSection[] {
  return (Object.keys(DASHBOARD_SECTION_ROLES) as DashboardSection[]).filter(
    (section) => DASHBOARD_SECTION_ROLES[section].some((role) => roles.includes(role))
  )
}
