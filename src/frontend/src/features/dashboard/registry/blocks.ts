import type { DashboardBlock, PackId } from './types'

/**
 * Catálogo de bloques del dashboard — fuente única de verdad.
 *
 * Procede del diseño "Dashboard — Grupo Security" (6 artboards de 1440 px).
 * Cada bloque declara a qué paquete pertenece y con qué alcance se muestra; el
 * mapeo a roles NO vive aquí, sino en el seed del backend, que es donde se
 * conceden los permisos.
 *
 * Agregar un bloque es añadir una entrada, nunca un `if` en el compositor.
 */

export interface PackDefinition {
  id: PackId
  title: string
  description: string
}

export const PACKS: PackDefinition[] = [
  { id: 'ventas', title: 'Ventas y metas', description: 'Metas, avance y ventas por equipo o categoría' },
  { id: 'cotizaciones', title: 'Cotizaciones', description: 'Embudo, valor en negociación y seguimiento' },
  { id: 'clientes', title: 'Clientes', description: 'Mejores clientes y actividad comercial' },
  { id: 'catalogo', title: 'Catálogo', description: 'Productos publicados, búsqueda y promociones' },
  { id: 'listas', title: 'Listas', description: 'Gestión y vigencia de las Listas de precios' },
  { id: 'publicacion', title: 'Publicación', description: 'Cola y pendientes de publicación' },
  { id: 'usuarios', title: 'Usuarios y accesos', description: 'Gestión de usuarios y gobernanza de accesos' },
  { id: 'auditoria', title: 'Auditoría y salud', description: 'Eventos de auditoría y alertas del sistema' },
  { id: 'operacion', title: 'Operación de productos', description: 'Tareas de actualización de catálogo' },
]

export const DASHBOARD_BLOCKS: DashboardBlock[] = [
  // --- Ventas y metas -------------------------------------------------------
  { id: 'kpi-ventas-mes', title: 'Ventas del mes', kind: 'kpi', pack: 'ventas', scope: 'global', order: 10 },
  { id: 'kpi-cierre-mes', title: 'Cierre del mes', kind: 'kpi', pack: 'ventas', scope: 'own', order: 20 },
  { id: 'hero-meta-mensual', title: 'Meta mensual', kind: 'panel', pack: 'ventas', scope: 'own', span: 'full', order: 100 },
  { id: 'hero-meta-equipo', title: 'Meta del equipo', kind: 'panel', pack: 'ventas', scope: 'team', span: 'full', order: 110 },
  { id: 'ranking-equipo', title: 'Ranking del equipo', kind: 'panel', pack: 'ventas', scope: 'team', span: 'half', order: 200 },
  { id: 'ventas-por-equipo', title: 'Ventas por equipo', kind: 'panel', pack: 'ventas', scope: 'global', span: 'half', order: 210 },
  { id: 'ventas-por-categoria', title: 'Ventas por categoría', kind: 'panel', pack: 'ventas', scope: 'team', span: 'half', order: 220 },

  // --- Cotizaciones ---------------------------------------------------------
  { id: 'kpi-cotizaciones-abiertas', title: 'Cotizaciones abiertas', kind: 'kpi', pack: 'cotizaciones', scope: 'own', order: 30 },
  { id: 'kpi-valor-negociacion', title: 'Valor en negociación', kind: 'kpi', pack: 'cotizaciones', scope: 'own', order: 40 },
  { id: 'kpi-tasa-conversion', title: 'Tasa de conversión', kind: 'kpi', pack: 'cotizaciones', scope: 'own', order: 50 },
  { id: 'kpi-ganadas-mes', title: 'Ganadas este mes', kind: 'kpi', pack: 'cotizaciones', scope: 'own', order: 60 },
  { id: 'kpi-nuevas-semana', title: 'Nuevas esta semana', kind: 'kpi', pack: 'cotizaciones', scope: 'own', order: 70 },
  { id: 'embudo-cotizaciones', title: 'Embudo de cotizaciones', kind: 'panel', pack: 'cotizaciones', scope: 'own', span: 'half', order: 300 },
  { id: 'embudo-consolidado', title: 'Embudo consolidado del equipo', kind: 'panel', pack: 'cotizaciones', scope: 'team', span: 'half', order: 310 },
  { id: 'necesitan-atencion', title: 'Necesitan tu atención', kind: 'panel', pack: 'cotizaciones', scope: 'own', span: 'half', order: 320 },
  { id: 'mis-cotizaciones-recientes', title: 'Mis cotizaciones recientes', kind: 'panel', pack: 'cotizaciones', scope: 'own', span: 'full', order: 330 },

  // --- Clientes -------------------------------------------------------------
  { id: 'mejores-clientes', title: 'Mejores clientes', kind: 'panel', pack: 'clientes', scope: 'own', span: 'full', order: 400 },

  // --- Catálogo -------------------------------------------------------------
  { id: 'kpi-productos-publicados', title: 'Productos publicados', kind: 'kpi', pack: 'catalogo', scope: 'global', order: 80 },
  { id: 'kpi-productos-visibles', title: 'Productos visibles', kind: 'kpi', pack: 'catalogo', scope: 'own', order: 90 },
  { id: 'kpi-categorias', title: 'Categorías', kind: 'kpi', pack: 'catalogo', scope: 'global', order: 100 },
  { id: 'kpi-ultima-actualizacion', title: 'Última actualización', kind: 'kpi', pack: 'catalogo', scope: 'global', order: 110 },
  { id: 'buscador-catalogo', title: 'Buscar producto', kind: 'panel', pack: 'catalogo', scope: 'own', span: 'full', order: 50 },
  { id: 'catalogo-tabla', title: 'Catálogo', kind: 'panel', pack: 'catalogo', scope: 'own', span: 'half', order: 500 },
  { id: 'ultimos-publicados', title: 'Últimos productos publicados', kind: 'panel', pack: 'catalogo', scope: 'own', span: 'full', order: 510 },
  { id: 'promociones-activas', title: 'Promociones activas', kind: 'panel', pack: 'catalogo', scope: 'own', span: 'half', order: 520 },

  // --- Listas ---------------------------------------------------------------
  { id: 'kpi-listas-activas', title: 'Listas activas', kind: 'kpi', pack: 'listas', scope: 'global', order: 120 },
  { id: 'kpi-listas-con-acceso', title: 'Listas con acceso', kind: 'kpi', pack: 'listas', scope: 'own', order: 130 },
  { id: 'gestion-listas', title: 'Gestión de Listas', kind: 'panel', pack: 'listas', scope: 'commercial', span: 'full', order: 600 },
  { id: 'listas-por-vencer', title: 'Listas de precios por vencer', kind: 'panel', pack: 'listas', scope: 'commercial', span: 'half', order: 610 },
  { id: 'mis-listas', title: 'Mis Listas', kind: 'panel', pack: 'listas', scope: 'own', span: 'half', order: 620 },

  // --- Publicación ----------------------------------------------------------
  { id: 'kpi-pendientes-publicacion', title: 'Pendientes de publicación', kind: 'kpi', pack: 'publicacion', scope: 'global', order: 140 },
  { id: 'cola-publicacion', title: 'Cola de publicación', kind: 'panel', pack: 'publicacion', scope: 'global', span: 'half', order: 700 },

  // --- Usuarios y accesos ---------------------------------------------------
  { id: 'kpi-usuarios-totales', title: 'Usuarios totales', kind: 'kpi', pack: 'usuarios', scope: 'global', order: 150 },
  { id: 'kpi-usuarios-comerciales', title: 'Usuarios comerciales', kind: 'kpi', pack: 'usuarios', scope: 'commercial', order: 160 },
  { id: 'kpi-vendedores-activos', title: 'Vendedores activos', kind: 'kpi', pack: 'usuarios', scope: 'team', order: 170 },
  { id: 'gestion-usuarios', title: 'Gestión de usuarios', kind: 'panel', pack: 'usuarios', scope: 'global', span: 'full', order: 800 },
  { id: 'usuarios-por-rol', title: 'Usuarios por rol', kind: 'panel', pack: 'usuarios', scope: 'global', span: 'half', order: 810 },
  { id: 'gobernanza-accesos', title: 'Gobernanza de accesos', kind: 'panel', pack: 'usuarios', scope: 'commercial', span: 'half', order: 820 },

  // --- Auditoría y salud ----------------------------------------------------
  { id: 'kpi-eventos-auditoria', title: 'Eventos de auditoría', kind: 'kpi', pack: 'auditoria', scope: 'global', order: 180 },
  { id: 'auditoria-reciente', title: 'Auditoría reciente', kind: 'panel', pack: 'auditoria', scope: 'commercial', span: 'full', order: 900 },
  { id: 'salud-gobernanza', title: 'Salud y gobernanza', kind: 'panel', pack: 'auditoria', scope: 'global', span: 'half', order: 910 },
  { id: 'alertas-supervision', title: 'Alertas de supervisión', kind: 'panel', pack: 'auditoria', scope: 'team', span: 'half', order: 920 },

  // --- Operación de productos ----------------------------------------------
  { id: 'kpi-productos-administro', title: 'Productos que administro', kind: 'kpi', pack: 'operacion', scope: 'own', order: 190 },
  { id: 'kpi-actualizados-hoy', title: 'Actualizados hoy', kind: 'kpi', pack: 'operacion', scope: 'own', order: 200 },
  { id: 'kpi-pendientes-actualizar', title: 'Pendientes de actualizar', kind: 'kpi', pack: 'operacion', scope: 'own', order: 210 },
  { id: 'kpi-imagenes-faltantes', title: 'Imágenes faltantes', kind: 'kpi', pack: 'operacion', scope: 'own', order: 220 },
  { id: 'mis-tareas-pendientes', title: 'Mis tareas pendientes', kind: 'panel', pack: 'operacion', scope: 'own', span: 'full', order: 1000 },
  { id: 'productos-administro-tabla', title: 'Productos que administro', kind: 'panel', pack: 'operacion', scope: 'own', span: 'full', order: 1010 },
]

/** Bloques de un paquete. */
export function blocksInPack(packId: PackId): DashboardBlock[] {
  return DASHBOARD_BLOCKS.filter((b) => b.pack === packId)
}

/** Índice por id, para resolver permisos individuales sin recorrer el array. */
export const BLOCKS_BY_ID = new Map(DASHBOARD_BLOCKS.map((b) => [b.id, b]))
