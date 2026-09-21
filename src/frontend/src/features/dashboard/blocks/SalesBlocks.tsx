import { Link } from 'react-router-dom'
import { DataGrid, StatusPill, type DataGridColumn } from '../../../components/ui'
import BlockShell from '../components/BlockShell'
import {
  useWorkspace,
  useTopCustomers,
  useSalesByCategory,
  formatMoney,
  formatNumber,
  clampPercent,
} from './shared'
import type { BlockProps } from '../registry/types'

/**
 * Barra de avance hacia una meta (*bullet chart* del diseño).
 *
 * Se dibuja con CSS puro en lugar de una librería de gráficos: son dos barras
 * superpuestas y una marca, y añadir ~500 KB de dependencia para esto no se
 * justifica. El porcentaje va también en texto, porque una barra por sí sola no
 * es legible para un lector de pantalla.
 */
function MetaBar({
  label,
  invoiced,
  target,
  currency,
}: {
  label: string
  invoiced: number
  target: number | null
  currency: string
}) {
  const percent = target && target > 0 ? clampPercent((invoiced / target) * 100) : 0
  const alcanzada = target !== null && invoiced >= target

  return (
    <div className="rounded-card border border-surface-200 bg-[var(--color-bg-card)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-400">{label}</p>
          <p className="mt-2 text-metric font-condensed text-ink-900">
            {formatMoney(invoiced, currency)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-micro text-ink-400">Meta</p>
          <p className="text-body-sm font-semibold text-ink-700">
            {target === null ? 'Sin fijar' : formatMoney(target, currency)}
          </p>
        </div>
      </div>

      {target !== null && target > 0 && (
        <>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-100"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${Math.round(percent)} por ciento de la meta`}
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                alcanzada ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="mt-2 text-micro text-ink-500">
            {Math.round(percent)}% de la meta
            {alcanzada ? ' · alcanzada' : ` · faltan ${formatMoney(target - invoiced, currency)}`}
          </p>
        </>
      )}
    </div>
  )
}

/** Meta mensual del vendedor. */
export function HeroMetaMensual() {
  const { data, isLoading, error } = useWorkspace()
  const c = data?.commercial

  if (isLoading) return <MetaSkeleton />
  if (error || !c) return <MetaUnavailable />

  return (
    <MetaBar
      label="Mi avance del mes"
      invoiced={Number(c.invoiced.amount)}
      target={c.target ? Number(c.target.amount) : null}
      currency={c.invoiced.currency}
    />
  )
}

/** Meta agregada del equipo, para el supervisor. */
export function HeroMetaEquipo() {
  const { data, isLoading, error } = useWorkspace()
  const totals = data?.team?.totals

  if (isLoading) return <MetaSkeleton />
  if (error || !totals) return <MetaUnavailable message="No tienes un equipo asignado." />

  return (
    <MetaBar
      label="Avance del equipo este mes"
      invoiced={Number(totals.invoiced.amount)}
      target={Number(totals.target.amount) || null}
      currency={totals.invoiced.currency}
    />
  )
}

function MetaSkeleton() {
  return (
    <div className="rounded-card border border-surface-200 bg-[var(--color-bg-card)] p-5" aria-hidden>
      <div className="h-3 w-32 animate-pulse rounded bg-surface-100" />
      <div className="mt-3 h-7 w-44 animate-pulse rounded bg-surface-100" />
      <div className="mt-4 h-2.5 animate-pulse rounded-full bg-surface-100" />
    </div>
  )
}

function MetaUnavailable({ message = 'No hay datos de meta disponibles.' }: { message?: string }) {
  return (
    <div className="rounded-card border border-surface-200 bg-[var(--color-bg-card)] p-5">
      <p className="text-caption text-ink-400">{message}</p>
    </div>
  )
}

/**
 * Embudo de cotizaciones por estado.
 *
 * Las barras se dimensionan contra el estado más numeroso, no contra el total:
 * con un total como referencia, un embudo realista dejaría todas las barras
 * casi invisibles.
 */
function Funnel({ steps }: { steps: Array<{ label: string; count: number }> }) {
  const max = Math.max(...steps.map((s) => s.count), 1)

  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-surface-200 bg-[var(--color-bg-card)] p-5">
      {steps.map((step) => (
        <div key={step.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-micro text-ink-500">{step.label}</span>

          <div className="h-6 flex-1 overflow-hidden rounded bg-surface-100">
            <div
              className="h-full rounded bg-[var(--color-primary)]/80"
              style={{ width: `${clampPercent((step.count / max) * 100)}%` }}
            />
          </div>

          <span className="w-10 shrink-0 text-right text-body-sm font-semibold text-ink-900">
            {formatNumber(step.count)}
          </span>
        </div>
      ))}
    </div>
  )
}

const FUNNEL_STEPS = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'enviada', label: 'Enviada' },
  { key: 'negociacion', label: 'Negociación' },
  { key: 'ganada', label: 'Ganada' },
  { key: 'perdida', label: 'Perdida' },
] as const

export function EmbudoCotizaciones() {
  const { data, isLoading, error } = useWorkspace()
  const q = data?.commercial?.myQuotes

  return (
    <BlockShell title="Embudo de cotizaciones" linkTo="/commercial/quotes">
      {isLoading ? (
        <FunnelSkeleton />
      ) : error || !q ? (
        <MetaUnavailable message="No hay cotizaciones para mostrar." />
      ) : (
        <Funnel steps={FUNNEL_STEPS.map((s) => ({ label: s.label, count: q[s.key] ?? 0 }))} />
      )}
    </BlockShell>
  )
}

/** Embudo agregado de todo el equipo. */
export function EmbudoConsolidado() {
  const { data, isLoading, error } = useWorkspace()
  const members = data?.team?.members

  const totals = FUNNEL_STEPS.map((s) => ({
    label: s.label,
    count: (members ?? []).reduce((acc, m) => acc + (m.quotesByStatus?.[s.key] ?? 0), 0),
  }))

  return (
    <BlockShell title="Embudo consolidado del equipo" linkTo="/commercial/quotes">
      {isLoading ? (
        <FunnelSkeleton />
      ) : error || !members?.length ? (
        <MetaUnavailable message="No tienes un equipo asignado." />
      ) : (
        <Funnel steps={totals} />
      )}
    </BlockShell>
  )
}

function FunnelSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-surface-200 bg-[var(--color-bg-card)] p-5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-surface-100" />
      ))}
    </div>
  )
}

/** Ranking del equipo por avance de meta. */
export function RankingEquipo() {
  const { data, isLoading, error } = useWorkspace()

  const miembros = [...(data?.team?.members ?? [])].sort((a, b) => {
    const avance = (m: typeof a) => {
      const target = m.target ? Number(m.target.amount) : 0
      return target > 0 ? Number(m.invoiced.amount) / target : 0
    }
    return avance(b) - avance(a)
  })

  type Member = (typeof miembros)[number]

  const columns: DataGridColumn<Member>[] = [
    { key: 'name', header: 'Vendedor', width: 1.6, render: (m) => m.name },
    {
      key: 'invoiced',
      header: 'Facturado',
      width: 1.2,
      render: (m) => formatMoney(m.invoiced.amount, m.invoiced.currency),
    },
    {
      key: 'progress',
      header: 'Avance',
      width: 1.4,
      render: (m) => {
        const target = m.target ? Number(m.target.amount) : 0

        if (target <= 0) return <span className="text-micro text-ink-400">Sin meta</span>

        const percent = clampPercent((Number(m.invoiced.amount) / target) * 100)

        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-100">
              <div
                className={`h-full rounded-full ${percent >= 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="w-9 text-right text-micro text-ink-500">{Math.round(percent)}%</span>
          </div>
        )
      },
    },
  ]

  return (
    <BlockShell title="Ranking del equipo — avance de meta">
      <DataGrid
        columns={columns}
        rows={miembros}
        rowKey={(m) => m.userId}
        loading={isLoading}
        error={!!error}
        emptyMessage="No tienes vendedores a cargo."
      />
    </BlockShell>
  )
}

/** Ventas por equipo: mismo dato que el ranking, ordenado por facturación. */
export function VentasPorEquipo() {
  const { data, isLoading, error } = useWorkspace()

  const miembros = [...(data?.team?.members ?? [])].sort(
    (a, b) => Number(b.invoiced.amount) - Number(a.invoiced.amount),
  )

  type Member = (typeof miembros)[number]

  const columns: DataGridColumn<Member>[] = [
    { key: 'name', header: 'Vendedor', width: 1.6, render: (m) => m.name },
    { key: 'invoiced', header: 'Facturado', width: 1.2, render: (m) => formatMoney(m.invoiced.amount, m.invoiced.currency) },
    { key: 'pipeline', header: 'En negociación', width: 1.2, hideOnMobile: true, render: (m) => formatMoney(m.pipeline.amount) },
  ]

  return (
    <BlockShell title="Ventas por equipo — este mes">
      <DataGrid
        columns={columns}
        rows={miembros}
        rowKey={(m) => m.userId}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay equipo asignado."
      />
    </BlockShell>
  )
}

/** Ventas del mes por categoría de producto. */
export function VentasPorCategoria() {
  const { data, isLoading, error } = useSalesByCategory()

  const max = Math.max(...(data ?? []).map((c) => Number(c.amount)), 1)

  return (
    <BlockShell title="Ventas por categoría">
      {isLoading ? (
        <FunnelSkeleton />
      ) : error ? (
        <MetaUnavailable message="No se pudieron cargar las ventas por categoría." />
      ) : (data ?? []).length === 0 ? (
        <MetaUnavailable message="No hay ventas facturadas este mes." />
      ) : (
        <div className="flex flex-col gap-2.5 rounded-panel border border-surface-200 bg-[var(--color-bg-card)] p-5">
          {data!.map((c) => (
            <div key={c.category} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-micro text-ink-500" title={c.category}>
                {c.category}
              </span>

              <div className="h-5 flex-1 overflow-hidden rounded bg-surface-100">
                <div
                  className="h-full rounded bg-[var(--color-primary)]/70"
                  style={{ width: `${clampPercent((Number(c.amount) / max) * 100)}%` }}
                />
              </div>

              <span className="shrink-0 text-micro font-semibold text-ink-900">
                {formatMoney(c.amount, c.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </BlockShell>
  )
}

/**
 * Mejores clientes. El alcance lo resuelve el servidor a partir del rol: un
 * vendedor ve su cartera y un supervisor la de la empresa. El `scope` que llega
 * por props sólo ajusta el título.
 */
export function MejoresClientes({ scope }: BlockProps) {
  const { data, isLoading, error } = useTopCustomers()

  type Row = NonNullable<typeof data>[number]

  const columns: DataGridColumn<Row>[] = [
    { key: 'name', header: 'Cliente', width: 2, render: (r) => r.name },
    { key: 'orders', header: 'Pedidos', width: 0.8, hideOnMobile: true, render: (r) => formatNumber(r.orders) },
    { key: 'invoiced', header: 'Facturado', width: 1.2, render: (r) => formatMoney(r.invoiced, r.currency) },
  ]

  return (
    <BlockShell
      title={scope === 'own' ? 'Mejores clientes este mes' : 'Mejores clientes de la empresa'}
      linkTo="/commercial/customers"
    >
      <DataGrid
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay facturación registrada este mes."
      />
    </BlockShell>
  )
}

/**
 * Cotizaciones que requieren seguimiento: las que llevan más tiempo abiertas.
 * Se deriva del propio embudo, sin endpoint adicional.
 */
export function NecesitanAtencion() {
  const { data, isLoading, error } = useWorkspace()
  const q = data?.commercial?.myQuotes

  const alertas = [
    q?.borrador ? { id: 'borrador', texto: `${q.borrador} cotizaciones sin enviar`, tono: 'warning' as const } : null,
    q?.negociacion ? { id: 'negociacion', texto: `${q.negociacion} en negociación esperando respuesta`, tono: 'info' as const } : null,
    q?.enviada ? { id: 'enviada', texto: `${q.enviada} enviadas sin cerrar`, tono: 'neutral' as const } : null,
  ].filter(Boolean) as Array<{ id: string; texto: string; tono: 'warning' | 'info' | 'neutral' }>

  return (
    <BlockShell title="Necesitan tu atención" linkTo="/commercial/quotes">
      <div className="overflow-hidden rounded-panel border border-surface-200 bg-[var(--color-bg-card)]">
        {isLoading ? (
          <div className="px-5 py-6" aria-hidden>
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-100" />
          </div>
        ) : error ? (
          <p role="alert" className="px-5 py-6 text-center text-caption text-[var(--color-error)]">
            No se pudo cargar el seguimiento.
          </p>
        ) : alertas.length === 0 ? (
          <p className="px-5 py-6 text-center text-caption text-ink-400">
            No tienes cotizaciones pendientes. Todo al día.
          </p>
        ) : (
          alertas.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 border-b border-surface-100 px-5 py-3 last:border-b-0"
            >
              <p className="text-body-sm text-ink-900">{a.texto}</p>
              <StatusPill tone={a.tono}>Revisar</StatusPill>
            </div>
          ))
        )}
      </div>
    </BlockShell>
  )
}

/** Cotizaciones recientes del usuario. */
export function MisCotizacionesRecientes() {
  const { data, isLoading, error } = useWorkspace()
  const q = data?.commercial?.myQuotes

  const filas = FUNNEL_STEPS.map((s) => ({
    estado: s.label,
    key: s.key,
    total: q?.[s.key] ?? 0,
  })).filter((f) => f.total > 0)

  type Row = (typeof filas)[number]

  const columns: DataGridColumn<Row>[] = [
    { key: 'estado', header: 'Estado', width: 2, render: (r) => r.estado },
    { key: 'total', header: 'Cotizaciones', width: 1, render: (r) => formatNumber(r.total) },
  ]

  return (
    <BlockShell title="Mis cotizaciones por estado" linkTo="/commercial/quotes">
      <DataGrid
        columns={columns}
        rows={filas}
        rowKey={(r) => r.key}
        loading={isLoading}
        error={!!error}
        emptyMessage="Todavía no has creado cotizaciones."
      />
    </BlockShell>
  )
}

/** Accesos rápidos al trabajo comercial diario. */
export function PromocionesActivas() {
  const enlaces = [
    { to: '/commercial/quotes', label: 'Nueva cotización' },
    { to: '/commercial/customers', label: 'Mis clientes' },
    { to: '/commercial/products', label: 'Buscar productos' },
    { to: '/commercial/lists', label: 'Listas de precios' },
  ]

  return (
    <BlockShell title="Accesos rápidos">
      <div className="grid grid-cols-2 gap-3">
        {enlaces.map((e) => (
          <Link
            key={e.to}
            to={e.to}
            className="rounded-control border border-surface-200 bg-[var(--color-bg-card)] px-4 py-3 text-body-sm font-semibold text-ink-700 transition-colors hover:border-surface-300 hover:bg-surface-50"
          >
            {e.label}
          </Link>
        ))}
      </div>
    </BlockShell>
  )
}
