import type { ComponentType } from 'react'

/**
 * Identificador de paquete temático. Un paquete agrupa bloques afines para que
 * el Super Admin reparta temas, no piezas sueltas.
 */
export type PackId =
  | 'ventas'
  | 'cotizaciones'
  | 'clientes'
  | 'catalogo'
  | 'listas'
  | 'publicacion'
  | 'usuarios'
  | 'auditoria'
  | 'operacion'

/**
 * Alcance de los datos que muestra un bloque.
 *
 * Existen bloques idénticos con distinto alcance según el rol: "Mejores
 * clientes de la empresa" (Supervisor) y "Mejores clientes del mes" (Vendedor)
 * son el mismo componente con distinto filtro. Un usuario con ambos roles debe
 * ver **uno solo**, con el alcance más amplio que tenga permitido; renderizar
 * los dos mostraría la misma tabla dos veces con datos distintos, y parecería
 * un error de la aplicación.
 *
 * El orden de la constante `SCOPE_RANK` define cuál gana.
 */
export type BlockScope = 'own' | 'team' | 'commercial' | 'global'

/** De menor a mayor amplitud. Gana el mayor que el usuario tenga permitido. */
export const SCOPE_RANK: Record<BlockScope, number> = {
  own: 0,
  team: 1,
  commercial: 2,
  global: 3,
}

export type BlockKind = 'kpi' | 'panel'

/** Ancho del bloque en la rejilla de paneles. Los KPI siempre ocupan una celda. */
export type BlockSpan = 'half' | 'full'

/**
 * Propiedades que el compositor inyecta en todo bloque. El alcance resuelto
 * llega aquí para que el componente consulte el endpoint adecuado.
 */
export interface BlockProps {
  scope: BlockScope
}

export interface DashboardBlock {
  /** Identificador estable. Forma el permiso: `dashboard:block:<id>`. */
  id: string

  /** Título visible. En un KPI es la etiqueta superior. */
  title: string

  kind: BlockKind

  pack: PackId

  /**
   * Alcance con el que se declara este bloque. Cuando dos entradas comparten
   * `id`, el compositor conserva la de mayor alcance.
   */
  scope: BlockScope

  /** Sólo aplica a `kind: 'panel'`. Por defecto `half`. */
  span?: BlockSpan

  /**
   * Orden dentro de su sección. Menor va primero. Se deja hueco entre valores
   * para poder intercalar bloques sin renumerar todo.
   */
  order: number

  /**
   * Componente que lo renderiza. `undefined` significa declarado pero aún no
   * implementado: el catálogo describe el diseño completo desde el día uno,
   * mientras las fases 3, 4 y 6 van rellenando los componentes. El compositor
   * omite los bloques sin componente.
   */
  component?: ComponentType<BlockProps>
}

/** Permiso que habilita un bloque individual. */
export function blockPermission(blockId: string): string {
  return `dashboard:block:${blockId}`
}

/** Permiso que habilita un paquete completo. */
export function packPermission(packId: PackId): string {
  return `dashboard:pack:${packId}`
}
