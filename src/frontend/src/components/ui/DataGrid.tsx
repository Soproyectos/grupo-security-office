import type { ReactNode } from 'react'

export interface DataGridColumn<T> {
  /** Clave estable de la columna. */
  key: string
  header: string
  /** Fracción de ancho, como en `grid-template-columns`. Por defecto 1. */
  width?: number
  render: (row: T) => ReactNode
  /** Oculta la columna por debajo de `sm`. Para columnas accesorias. */
  hideOnMobile?: boolean
}

interface DataGridProps<T> {
  columns: DataGridColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: boolean
  /** Mensaje cuando no hay filas. */
  emptyMessage?: string
  /** Filas del esqueleto de carga. */
  skeletonRows?: number
  onRowClick?: (row: T) => void
}

/**
 * Tabla compacta del diseño de dashboards.
 *
 * Usa CSS grid con anchos fraccionales en vez de `<table>` porque el diseño
 * define columnas proporcionales (1.8fr / 1.2fr / 0.9fr) que una tabla HTML no
 * reparte igual. Para no perder semántica, se marcan los roles ARIA de tabla:
 * un lector de pantalla sigue anunciando filas y celdas.
 *
 * Los tres estados —cargando, error y vacío— son parte del componente: dejarlos
 * a cada bloque llevaría a que unos los tuvieran y otros no.
 */
export default function DataGrid<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = false,
  emptyMessage = 'No hay registros.',
  skeletonRows = 4,
  onRowClick,
}: DataGridProps<T>) {
  const template = columns.map((c) => `${c.width ?? 1}fr`).join(' ')

  const cellClass = (col: DataGridColumn<T>) =>
    col.hideOnMobile ? 'hidden sm:block' : ''

  return (
    <div
      role="table"
      className="overflow-hidden rounded-panel border border-surface-200 bg-[var(--color-bg-card)]"
    >
      <div
        role="row"
        className="grid gap-3 border-b border-surface-200 bg-surface-50 px-5 py-2.5"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((col) => (
          <span
            key={col.key}
            role="columnheader"
            className={`font-condensed text-eyebrow uppercase text-ink-400 ${cellClass(col)}`}
          >
            {col.header}
          </span>
        ))}
      </div>

      {loading ? (
        Array.from({ length: skeletonRows }).map((_, i) => (
          <div
            key={i}
            className="grid gap-3 border-b border-surface-100 px-5 py-3 last:border-b-0"
            style={{ gridTemplateColumns: template }}
            aria-hidden
          >
            {columns.map((col) => (
              <div key={col.key} className={`h-4 animate-pulse rounded bg-surface-100 ${cellClass(col)}`} />
            ))}
          </div>
        ))
      ) : error ? (
        <p role="alert" className="px-5 py-6 text-center text-caption text-[var(--color-error)]">
          No se pudieron cargar los datos. Intente más tarde.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-caption text-ink-400">{emptyMessage}</p>
      ) : (
        rows.map((row) => {
          const cells = columns.map((col) => (
            <span key={col.key} role="cell" className={`text-body-sm text-ink-900 ${cellClass(col)}`}>
              {col.render(row)}
            </span>
          ))

          const rowClass =
            'grid w-full items-center gap-3 border-b border-surface-100 px-5 py-3 text-left last:border-b-0'

          // Fila pulsable: se usa un <button> real en vez de un div con onClick,
          // para que el teclado pueda alcanzarla y activarla.
          return onRowClick ? (
            <button
              key={rowKey(row)}
              type="button"
              role="row"
              onClick={() => onRowClick(row)}
              className={`${rowClass} transition-colors hover:bg-surface-50`}
              style={{ gridTemplateColumns: template }}
            >
              {cells}
            </button>
          ) : (
            <div
              key={rowKey(row)}
              role="row"
              className={rowClass}
              style={{ gridTemplateColumns: template }}
            >
              {cells}
            </div>
          )
        })
      )}
    </div>
  )
}
