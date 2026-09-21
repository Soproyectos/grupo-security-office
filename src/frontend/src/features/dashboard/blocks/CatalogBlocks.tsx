import { Link } from 'react-router-dom'
import { DataGrid, StatusPill, type DataGridColumn } from '../../../components/ui'
import BlockShell from '../components/BlockShell'
import { useCatalogInsights, useWorkspace, formatRelative, formatNumber } from './shared'
import type { CatalogInsights } from '../../../services/dashboard-insights.service'

type CatalogRow = CatalogInsights['latest'][number]

/** Traduce el estado del ciclo de vida a una insignia legible. */
function lifecyclePill(status: string) {
  const map: Record<string, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
    PUBLISHED: { tone: 'success', label: 'Publicado' },
    READY: { tone: 'warning', label: 'Listo' },
    DRAFT: { tone: 'neutral', label: 'Borrador' },
    ARCHIVED: { tone: 'neutral', label: 'Archivado' },
  }

  return map[status] ?? { tone: 'neutral' as const, label: status }
}

/** Catálogo: últimos productos con su estado. */
export function CatalogoTabla() {
  const { data, isLoading, error } = useCatalogInsights()

  const columns: DataGridColumn<CatalogRow>[] = [
    { key: 'name', header: 'Producto', width: 1.8, render: (r) => r.name },
    { key: 'category', header: 'Categoría', width: 1.2, hideOnMobile: true, render: (r) => r.category },
    {
      key: 'status',
      header: 'Estado',
      width: 0.9,
      render: (r) => {
        const pill = lifecyclePill(r.lifecycleStatus)
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
      },
    },
  ]

  return (
    <BlockShell title="Catálogo" linkTo="/commercial/products">
      <DataGrid
        columns={columns}
        rows={data?.latest ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="Todavía no hay productos en el catálogo."
      />
    </BlockShell>
  )
}

/** Últimos productos publicados, en formato de actividad. */
export function UltimosPublicados() {
  const { data, isLoading, error } = useCatalogInsights()

  const publicados = (data?.latest ?? []).filter((p) => p.lifecycleStatus === 'PUBLISHED')

  return (
    <BlockShell title="Últimos productos publicados" linkTo="/commercial/products">
      <div className="overflow-hidden rounded-panel border border-surface-200 bg-[var(--color-bg-card)]">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-surface-100 px-5 py-3 last:border-b-0" aria-hidden>
              <div className="h-4 w-2/3 animate-pulse rounded bg-surface-100" />
            </div>
          ))
        ) : error ? (
          <p role="alert" className="px-5 py-6 text-center text-caption text-[var(--color-error)]">
            No se pudieron cargar los productos.
          </p>
        ) : publicados.length === 0 ? (
          <p className="px-5 py-6 text-center text-caption text-ink-400">
            Aún no hay productos publicados.
          </p>
        ) : (
          publicados.map((p) => (
            <Link
              key={p.id}
              to={`/commercial/products/${p.id}`}
              className="flex items-center justify-between gap-3 border-b border-surface-100 px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-50"
            >
              <p className="text-body-sm text-ink-900">
                {p.name} <span className="text-ink-400">· {p.category}</span>
              </p>
              <span className="shrink-0 text-micro text-ink-400">{formatRelative(p.updatedAt)}</span>
            </Link>
          ))
        )}
      </div>
    </BlockShell>
  )
}

/** Buscador del catálogo. Lleva a la pantalla de productos, que tiene el filtro real. */
export function BuscadorCatalogo() {
  return (
    <Link
      to="/commercial/products"
      className="flex items-center gap-2.5 rounded-control border border-surface-200 bg-[var(--color-bg-card)] px-4 py-3 transition-colors hover:border-surface-300"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M21 21l-4.35-4.35M18 10.5a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
        />
      </svg>
      <span className="text-body-sm text-ink-400">
        Buscar producto por nombre, SKU o categoría…
      </span>
    </Link>
  )
}

/** Cola de publicación: lo que espera revisión. */
export function ColaPublicacion() {
  const { data, isLoading, error } = useCatalogInsights()

  const pendientes = (data?.latest ?? []).filter((p) => p.lifecycleStatus === 'READY')

  const columns: DataGridColumn<CatalogRow>[] = [
    { key: 'name', header: 'Producto', width: 2, render: (r) => r.name },
    { key: 'sku', header: 'SKU', width: 1, hideOnMobile: true, render: (r) => <span className="font-mono text-micro text-ink-400">{r.sku}</span> },
    { key: 'updated', header: 'Actualizado', width: 1, render: (r) => <span className="text-micro text-ink-400">{formatRelative(r.updatedAt)}</span> },
  ]

  return (
    <BlockShell
      title="Cola de publicación"
      linkTo="/commercial/products"
      aside={
        data && data.pendingPublication > 0 ? (
          <StatusPill tone="warning">{formatNumber(data.pendingPublication)}</StatusPill>
        ) : undefined
      }
    >
      <DataGrid
        columns={columns}
        rows={pendientes}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay productos esperando publicación."
      />
    </BlockShell>
  )
}

/** Productos que administra el operador, con su estado de actualización. */
export function ProductosAdministroTabla() {
  const { data, isLoading, error } = useCatalogInsights()

  const columns: DataGridColumn<CatalogRow>[] = [
    { key: 'name', header: 'Producto', width: 1.8, render: (r) => r.name },
    { key: 'sku', header: 'SKU', width: 1, hideOnMobile: true, render: (r) => <span className="font-mono text-micro text-ink-400">{r.sku}</span> },
    { key: 'category', header: 'Categoría', width: 1.2, hideOnMobile: true, render: (r) => r.category },
    { key: 'updated', header: 'Último cambio', width: 1.2, render: (r) => <span className="text-micro text-ink-400">{formatRelative(r.updatedAt)}</span> },
    {
      key: 'status',
      header: 'Estado',
      width: 1,
      render: (r) => {
        const pill = lifecyclePill(r.lifecycleStatus)
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
      },
    },
  ]

  return (
    <BlockShell title="Productos que administro" linkTo="/commercial/products" linkLabel="Ver catálogo completo">
      <DataGrid
        columns={columns}
        rows={data?.latest ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No administras productos todavía."
      />
    </BlockShell>
  )
}

/**
 * Tareas pendientes del operador, derivadas del estado real del catálogo:
 * productos sin publicar y fichas sin imagen. No es una lista de tareas
 * inventada — cada fila apunta a un producto concreto que le falta algo.
 */
export function MisTareasPendientes() {
  const { data, isLoading, error } = useCatalogInsights()

  interface Tarea {
    id: string
    producto: string
    tarea: string
    prioridad: 'Alta' | 'Media' | 'Baja'
  }

  const tareas: Tarea[] = (data?.latest ?? []).flatMap((p) => {
    const items: Tarea[] = []

    if (!p.hasImage) {
      items.push({ id: `${p.id}-img`, producto: p.name, tarea: 'Subir imagen', prioridad: 'Media' })
    }

    if (p.lifecycleStatus === 'READY') {
      items.push({ id: `${p.id}-pub`, producto: p.name, tarea: 'Revisar y publicar', prioridad: 'Alta' })
    }

    return items
  })

  const columns: DataGridColumn<Tarea>[] = [
    { key: 'producto', header: 'Producto', width: 1.8, render: (r) => r.producto },
    { key: 'tarea', header: 'Tarea', width: 1.2, render: (r) => r.tarea },
    {
      key: 'prioridad',
      header: 'Prioridad',
      width: 0.9,
      render: (r) => (
        <StatusPill tone={r.prioridad === 'Alta' ? 'danger' : r.prioridad === 'Media' ? 'warning' : 'neutral'}>
          {r.prioridad}
        </StatusPill>
      ),
    },
  ]

  return (
    <BlockShell title="Mis tareas pendientes" linkTo="/commercial/products">
      <DataGrid
        columns={columns}
        rows={tareas}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No tienes tareas pendientes."
      />
    </BlockShell>
  )
}

/** Listas a las que el usuario tiene acceso. */
export function MisListas() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <BlockShell title="Mis Listas" linkTo="/commercial/lists">
      <div className="overflow-hidden rounded-panel border border-surface-200 bg-[var(--color-bg-card)]">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-surface-100 px-5 py-3 last:border-b-0" aria-hidden>
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-100" />
            </div>
          ))
        ) : error ? (
          <p role="alert" className="px-5 py-6 text-center text-caption text-[var(--color-error)]">
            No se pudieron cargar las Listas.
          </p>
        ) : (data?.listas ?? []).length === 0 ? (
          <p className="px-5 py-6 text-center text-caption text-ink-400">
            No tienes Listas asignadas.
          </p>
        ) : (
          data!.listas.map((l) => (
            <Link
              key={l.id}
              to={`/commercial/lists/${l.id}`}
              className="block border-b border-surface-100 px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-50"
            >
              <p className="text-body-sm text-ink-900">{l.name}</p>
              <p className="mt-0.5 text-micro text-ink-400">
                {formatNumber(l.productCount)} {l.productCount === 1 ? 'producto' : 'productos'}
                {l.isResponsible && ' · eres responsable'}
              </p>
            </Link>
          ))
        )}
      </div>
    </BlockShell>
  )
}
