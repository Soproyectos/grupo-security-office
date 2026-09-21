import { Link } from 'react-router-dom'
import { DataGrid, StatusPill, type DataGridColumn, type PillTone } from '../../../components/ui'
import BlockShell from '../components/BlockShell'
import {
  useWorkspace,
  useUsersInsights,
  useCatalogInsights,
  formatNumber,
  formatRelative,
  clampPercent,
} from './shared'
import type { MyListaSummary } from '../../../services/dashboard.service'

/** Insignia de vigencia de una Lista a partir de los campos del backend. */
function listaTone(l: MyListaSummary): { tone: PillTone; label: string } {
  if (l.isResponsible) return { tone: 'info', label: 'Responsable' }
  return { tone: 'neutral', label: l.level ?? 'Acceso' }
}

/** Listas accesibles con su nivel de acceso. */
export function GestionListas() {
  const { data, isLoading, error } = useWorkspace()

  const columns: DataGridColumn<MyListaSummary>[] = [
    { key: 'code', header: 'Código', width: 0.9, hideOnMobile: true, render: (l) => <span className="font-mono text-micro text-ink-400">{l.code}</span> },
    { key: 'name', header: 'Lista', width: 2, render: (l) => l.name },
    { key: 'products', header: 'Productos', width: 0.9, render: (l) => formatNumber(l.productCount) },
    {
      key: 'level',
      header: 'Acceso',
      width: 1,
      render: (l) => {
        const t = listaTone(l)
        return <StatusPill tone={t.tone}>{t.label}</StatusPill>
      },
    },
  ]

  return (
    <BlockShell title="Gestión de Listas" linkTo="/commercial/lists">
      <DataGrid
        columns={columns}
        rows={data?.listas ?? []}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay Listas registradas todavía."
      />
    </BlockShell>
  )
}

/**
 * Listas ordenadas por antigüedad de su última actualización.
 *
 * El resumen del espacio de trabajo no expone la fecha de vencimiento, así que
 * este bloque señala las que llevan más tiempo sin tocarse — que es la señal
 * disponible, no una fecha de caducidad inventada. El título lo dice.
 */
export function ListasPorVencer() {
  const { data, isLoading, error } = useWorkspace()

  const listas = [...(data?.listas ?? [])].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  )

  const columns: DataGridColumn<MyListaSummary>[] = [
    { key: 'name', header: 'Lista', width: 2, render: (l) => l.name },
    { key: 'products', header: 'Productos', width: 0.8, hideOnMobile: true, render: (l) => formatNumber(l.productCount) },
    { key: 'updated', header: 'Sin cambios desde', width: 1.2, render: (l) => <span className="text-micro text-ink-400">{formatRelative(l.updatedAt)}</span> },
  ]

  return (
    <BlockShell title="Listas sin actualizar recientemente" linkTo="/commercial/lists">
      <DataGrid
        columns={columns}
        rows={listas.slice(0, 5)}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay Listas registradas."
      />
    </BlockShell>
  )
}

/** Distribución de usuarios por rol, con barra proporcional. */
export function UsuariosPorRol() {
  const { data, isLoading, error } = useUsersInsights()

  const max = Math.max(...(data?.byRole ?? []).map((r) => r.count), 1)

  return (
    <BlockShell title="Usuarios por rol" linkTo="/users">
      {isLoading ? (
        <div className="flex flex-col gap-2.5 rounded-panel border border-surface-200 bg-[var(--color-bg-card)] p-5" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-surface-100" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="rounded-panel border border-surface-200 bg-[var(--color-bg-card)] px-5 py-6 text-center text-caption text-[var(--color-error)]">
          No se pudo cargar la distribución de usuarios.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-panel border border-surface-200 bg-[var(--color-bg-card)] p-5">
          {data!.byRole.map((r) => (
            <div key={r.role} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-micro text-ink-500">{r.role}</span>

              <div className="h-5 flex-1 overflow-hidden rounded bg-surface-100">
                <div
                  className="h-full rounded bg-[var(--color-primary)]/70"
                  style={{ width: `${clampPercent((r.count / max) * 100)}%` }}
                />
              </div>

              <span className="w-8 shrink-0 text-right text-body-sm font-semibold text-ink-900">
                {formatNumber(r.count)}
              </span>
            </div>
          ))}
        </div>
      )}
    </BlockShell>
  )
}

/** Usuarios recientes con sus roles y estado. */
export function GestionUsuarios() {
  const { data, isLoading, error } = useUsersInsights()

  type Row = NonNullable<typeof data>['recent'][number]

  const columns: DataGridColumn<Row>[] = [
    { key: 'name', header: 'Usuario', width: 1.4, render: (u) => u.name },
    { key: 'email', header: 'Correo', width: 1.8, hideOnMobile: true, render: (u) => <span className="text-micro text-ink-400">{u.email}</span> },
    { key: 'roles', header: 'Roles', width: 1.4, render: (u) => u.roles.join(', ') || '—' },
    {
      key: 'status',
      header: 'Estado',
      width: 0.8,
      render: (u) => (
        <StatusPill tone={u.isActive ? 'success' : 'neutral'}>
          {u.isActive ? 'Activo' : 'Inactivo'}
        </StatusPill>
      ),
    },
  ]

  return (
    <BlockShell title="Gestión de usuarios" linkTo="/users">
      <DataGrid
        columns={columns}
        rows={data?.recent ?? []}
        rowKey={(u) => u.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay usuarios registrados."
      />
    </BlockShell>
  )
}

/** Usuarios comerciales: el subconjunto que trabaja el pipeline. */
export function UsuariosComerciales() {
  const { data, isLoading, error } = useUsersInsights()

  const comerciales = (data?.recent ?? []).filter((u) =>
    u.roles.some((r) => ['Vendedor', 'Supervisor', 'Admin Comercial'].includes(r)),
  )

  type Row = (typeof comerciales)[number]

  const columns: DataGridColumn<Row>[] = [
    { key: 'name', header: 'Usuario', width: 1.6, render: (u) => u.name },
    { key: 'roles', header: 'Roles', width: 1.6, render: (u) => u.roles.join(', ') },
    {
      key: 'status',
      header: 'Estado',
      width: 0.8,
      render: (u) => (
        <StatusPill tone={u.isActive ? 'success' : 'neutral'}>
          {u.isActive ? 'Activo' : 'Inactivo'}
        </StatusPill>
      ),
    },
  ]

  return (
    <BlockShell title="Usuarios comerciales" linkTo="/users">
      <DataGrid
        columns={columns}
        rows={comerciales}
        rowKey={(u) => u.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay usuarios comerciales registrados."
      />
    </BlockShell>
  )
}

/** Accesos por Lista: quién es responsable de qué. */
export function GobernanzaAccesos() {
  const { data, isLoading, error } = useWorkspace()

  const sinResponsable = (data?.listas ?? []).filter((l) => !l.isResponsible)

  const columns: DataGridColumn<MyListaSummary>[] = [
    { key: 'name', header: 'Lista', width: 2, render: (l) => l.name },
    { key: 'level', header: 'Mi nivel', width: 1, render: (l) => l.level ?? '—' },
    {
      key: 'owner',
      header: 'Responsable',
      width: 1,
      render: (l) => (
        <StatusPill tone={l.isResponsible ? 'success' : 'neutral'}>
          {l.isResponsible ? 'Yo' : 'Otro'}
        </StatusPill>
      ),
    },
  ]

  return (
    <BlockShell
      title="Gobernanza de accesos"
      linkTo="/commercial/assignments"
      aside={
        sinResponsable.length > 0 ? (
          <StatusPill tone="warning">{formatNumber(sinResponsable.length)} sin mi responsabilidad</StatusPill>
        ) : undefined
      }
    >
      <DataGrid
        columns={columns}
        rows={data?.listas ?? []}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay accesos asignados."
      />
    </BlockShell>
  )
}

/** Actividad reciente registrada en auditoría. */
export function AuditoriaReciente() {
  const { data, isLoading, error } = useWorkspace()

  type Row = NonNullable<typeof data>['recentActivity'][number]

  const columns: DataGridColumn<Row>[] = [
    { key: 'action', header: 'Acción', width: 1, render: (a) => a.action },
    { key: 'entity', header: 'Entidad', width: 1.2, render: (a) => a.entity },
    {
      key: 'result',
      header: 'Resultado',
      width: 0.9,
      hideOnMobile: true,
      render: (a) => (
        <StatusPill tone={a.result === 'ERROR' ? 'danger' : a.result === 'WARNING' ? 'warning' : 'success'}>
          {a.result ?? 'OK'}
        </StatusPill>
      ),
    },
    { key: 'when', header: 'Cuándo', width: 1, render: (a) => <span className="text-micro text-ink-400">{formatRelative(a.createdAt)}</span> },
  ]

  return (
    <BlockShell title="Auditoría reciente" linkTo="/audit">
      <DataGrid
        columns={columns}
        rows={data?.recentActivity ?? []}
        rowKey={(a) => a.id}
        loading={isLoading}
        error={!!error}
        emptyMessage="No hay actividad registrada."
      />
    </BlockShell>
  )
}

/**
 * Salud del catálogo: señales que exigen intervención, calculadas sobre datos
 * reales (fichas sin imagen, productos sin publicar, Listas sin productos).
 */
export function SaludGobernanza() {
  const catalog = useCatalogInsights()
  const workspace = useWorkspace()

  const isLoading = catalog.isLoading || workspace.isLoading
  const error = catalog.error || workspace.error

  const listasVacias = (workspace.data?.listas ?? []).filter((l) => l.productCount === 0).length

  const señales = [
    {
      id: 'imagenes',
      label: 'Productos sin imagen',
      value: catalog.data?.missingImages ?? 0,
      tone: (catalog.data?.missingImages ?? 0) > 0 ? ('warning' as const) : ('success' as const),
    },
    {
      id: 'publicacion',
      label: 'Listos sin publicar',
      value: catalog.data?.pendingPublication ?? 0,
      tone: (catalog.data?.pendingPublication ?? 0) > 0 ? ('warning' as const) : ('success' as const),
    },
    {
      id: 'listas-vacias',
      label: 'Listas sin productos',
      value: listasVacias,
      tone: listasVacias > 0 ? ('warning' as const) : ('success' as const),
    },
  ]

  return (
    <BlockShell title="Salud y gobernanza">
      <div className="overflow-hidden rounded-panel border border-surface-200 bg-[var(--color-bg-card)]">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-surface-100 px-5 py-3.5 last:border-b-0" aria-hidden>
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-100" />
            </div>
          ))
        ) : error ? (
          <p role="alert" className="px-5 py-6 text-center text-caption text-[var(--color-error)]">
            No se pudo evaluar la salud del catálogo.
          </p>
        ) : (
          señales.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 border-b border-surface-100 px-5 py-3.5 last:border-b-0"
            >
              <p className="text-body-sm text-ink-900">{s.label}</p>
              <StatusPill tone={s.tone}>{formatNumber(s.value)}</StatusPill>
            </div>
          ))
        )}
      </div>
    </BlockShell>
  )
}

/** Alertas de supervisión: miembros del equipo que van rezagados. */
export function AlertasSupervision() {
  const { data, isLoading, error } = useWorkspace()

  const rezagados = (data?.team?.members ?? []).filter((m) => {
    const target = m.target ? Number(m.target.amount) : 0
    return target > 0 && Number(m.invoiced.amount) / target < 0.5
  })

  const sinMeta = (data?.team?.members ?? []).filter((m) => !m.target)

  return (
    <BlockShell title="Alertas de supervisión" linkTo="/commercial/quotes">
      <div className="overflow-hidden rounded-panel border border-surface-200 bg-[var(--color-bg-card)]">
        {isLoading ? (
          <div className="px-5 py-6" aria-hidden>
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-100" />
          </div>
        ) : error ? (
          <p role="alert" className="px-5 py-6 text-center text-caption text-[var(--color-error)]">
            No se pudieron cargar las alertas.
          </p>
        ) : rezagados.length === 0 && sinMeta.length === 0 ? (
          <p className="px-5 py-6 text-center text-caption text-ink-400">
            Sin alertas. El equipo va en línea con sus metas.
          </p>
        ) : (
          <>
            {rezagados.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 border-b border-surface-100 px-5 py-3 last:border-b-0">
                <p className="text-body-sm text-ink-900">
                  {m.name} va por debajo del 50% de su meta
                </p>
                <StatusPill tone="warning">Revisar</StatusPill>
              </div>
            ))}

            {sinMeta.map((m) => (
              <div key={`${m.userId}-sinmeta`} className="flex items-center justify-between gap-3 border-b border-surface-100 px-5 py-3 last:border-b-0">
                <p className="text-body-sm text-ink-900">{m.name} no tiene meta fijada</p>
                <Link to="/commercial/settings" className="text-micro font-semibold text-[var(--color-primary)]">
                  Fijar meta
                </Link>
              </div>
            ))}
          </>
        )}
      </div>
    </BlockShell>
  )
}
