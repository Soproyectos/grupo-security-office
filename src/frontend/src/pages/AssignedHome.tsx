import { workspaceForRoles } from '../lib/workspace'
import { agendaActivitiesKey, fetchAgendaActivities } from '../services/agenda.service'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hasAssignedAction, useOwnUserAccess, usePanelAccess } from '../features/users/access'
import { useAuthStore } from '../stores/auth.store'
import {
  DASHBOARD_GOAL_QUERY_KEY,
  DASHBOARD_LIBRARY_STATS_QUERY_KEY,
  DASHBOARD_RESUME_QUERY_KEY,
  fetchLibraryStats,
  fetchMyWorkspace,
  fetchPersonalSalesGoal,
  invoiceSourceLabel,
} from '../services/dashboard-insights.service'

const PRODUCTS_TAB_PATH = '/commercial/products'

function formatDate(value: string | null): string {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin registro' : date.toLocaleDateString('es-CO')
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <p className="text-xs text-neutral-600">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}

/**
 * COM-05 frontend — «Mi resumen» asignado (AssignedHome).
 *
 * Datos REALES de la API con fuente visible; sin ejemplos ficticios (ficha
 * regla 2). Reglas del contrato §3:
 *  - «Facturado» pinta SOLO `invoiced` (referencia manual); las cotizaciones
 *    ganadas son CONTADOR de oportunidades, nunca sumadas a la facturación.
 *  - Toda cifra de facturación lleva `invoiceSourceLabel` (cero incluido):
 *    «Referencia manual · ERP sin conectar» — jamás «sincronizado».
 *  - El bloque de equipo se pinta SOLO si la API lo devuelve (`team`): sin
 *    `teamInsights:read` el servidor omite el bloque y la UI no lo inventa.
 */
export function AssignedHome() {
  const user = useAuthStore((state) => state.user)
  if (user && workspaceForRoles(user.roles ?? []) === 'sales') {
    return <SellerHome userId={user.id} roles={user.roles} />
  }
  return <ManagementSummary />
}

function ManagementSummary() {
  // Cada bloque aparece solo con la acción que lo habilita; ocultar no autoriza, el servidor decide los datos.
  const roles = useAuthStore((state) => state.user?.roles)
  const commercial = usePanelAccess('commercial')
  const catalog = usePanelAccess('catalog')
  const { access, status: accessStatus } = useOwnUserAccess()
  const accessReady = accessStatus === 'ready'
  const can = (actionId: string) =>
    hasAssignedAction({ roles, grants: access?.grants ?? null, status: accessStatus }, [actionId])
  const canSeeTargets = can('targets:read')
  const canSeeQuotes = can('quotes:read')
  const canSeeTeam = can('teamInsights:read')
  const hasAnyPanel = commercial.hasAnyPanel || catalog.hasAnyPanel

  const goalQuery = useQuery({
    queryKey: DASHBOARD_GOAL_QUERY_KEY,
    queryFn: fetchPersonalSalesGoal,
    enabled: canSeeTargets,
    retry: false,
    staleTime: 60_000,
  })
  const resumeQuery = useQuery({
    queryKey: DASHBOARD_RESUME_QUERY_KEY,
    queryFn: fetchMyWorkspace,
    enabled: commercial.hasAnyPanel,
    retry: false,
    staleTime: 60_000,
  })

  // Estadísticas de Biblioteca: permiso extra por pestaña. Si falla (403 o error) se omite sin alarmar.
  const libraryStatsQuery = useQuery({
    queryKey: DASHBOARD_LIBRARY_STATS_QUERY_KEY,
    queryFn: fetchLibraryStats,
    retry: false,
    staleTime: 60_000,
  })

  const goal = goalQuery.data
  const resume = resumeQuery.data
  const libraryStats = libraryStatsQuery.data

  // Avisos informativos: aquí solo se explica por qué no hay cifras. Solo una respuesta correcta y vacía significa «sin estadísticas habilitadas»; un error no dice nada del permiso.
  const libraryStatsSettled = libraryStatsQuery.isSuccess
  const hasLibraryStats = Boolean(libraryStats && Object.keys(libraryStats).length > 0)

  return (
    <main aria-label="Mi resumen asignado" className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Mi resumen</h1>

      {accessReady && !hasAnyPanel && (
        <section aria-label="Sin paneles asignados" className="rounded-lg border border-neutral-200 p-4">
          <p className="text-sm font-medium">No tienes paneles asignados.</p>
          <p className="mt-1 text-sm text-neutral-600">Pide a tu supervisor que te los asigne.</p>
        </section>
      )}
      {accessReady && catalog.hasAnyPanel && libraryStatsSettled && !hasLibraryStats && (
        <section aria-label="Estadísticas sin habilitar" className="rounded-lg border border-neutral-200 p-4">
          <p className="text-sm font-medium">Tu panel de Biblioteca no tiene estadísticas habilitadas.</p>
          <p className="mt-1 text-sm text-neutral-600">Pide a tu supervisor que las active.</p>
        </section>
      )}

      {canSeeTargets && goal && (
        <section aria-label="Facturación y meta" className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-medium text-neutral-600">Facturado</h2>
            <p className="text-2xl font-semibold" data-testid="facturado">
              {goal.invoiced.amount} {goal.invoiced.currency}
            </p>
            {/* COM-05 §3: fuente visible SIEMPRE, también en cero */}
            <p className="mt-1 text-xs text-neutral-500">{invoiceSourceLabel(goal.invoiced)}</p>
            {goal.invoiced.mixedCurrency && (
              <p className="mt-1 text-xs text-amber-700">Importes en monedas mixtas no sumados.</p>
            )}
          </article>
          <article className="rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-medium text-neutral-600">Meta del mes ({goal.period})</h2>
            <p className="text-2xl font-semibold" data-testid="meta">
              {goal.target ? `${goal.target.amount} ${goal.target.currency}` : 'Sin meta fijada'}
            </p>
            {goal.remaining && (
              <p className="mt-1 text-xs text-neutral-500">
                Restante: {goal.remaining.amount} {goal.remaining.currency}
              </p>
            )}
            {goal.progressPercent !== null && (
              <p className="mt-1 text-xs text-neutral-500">Avance: {goal.progressPercent}%</p>
            )}
          </article>
        </section>
      )}

      {canSeeQuotes && resume?.commercial && (
        <section aria-label="Cotizaciones y oportunidades" className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-600">Cotizaciones</h2>
          <p className="mt-2">
            Oportunidades abiertas:{' '}
            <span className="font-semibold">{resume.commercial.pipeline.count}</span> (
            {resume.commercial.pipeline.amount} {resume.commercial.invoiced.currency})
          </p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <li>Borradores: {resume.commercial.myQuotes.borrador}</li>
            <li>Enviadas: {resume.commercial.myQuotes.enviada}</li>
            <li>En negociación: {resume.commercial.myQuotes.negociacion}</li>
            {/* Contador de oportunidades, NO facturación (A1) */}
            <li>
              Ganadas (oportunidades): {resume.commercial.myQuotes.ganada}
            </li>
            <li>Perdidas: {resume.commercial.myQuotes.perdida}</li>
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Las cotizaciones ganadas son oportunidades: la facturación usa la referencia de factura
            de la tarjeta superior.
          </p>
        </section>
      )}

      {commercial.hasAnyPanel && resume && (
        <section aria-label="Actividad" className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-600">Actividad</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <li>Actividad reciente: {resume.kpis.recentActivity}</li>
          </ul>
        </section>
      )}

      {/* A2: el bloque existe SOLO si la API lo trajo; nada se inventa. */}
      {canSeeTeam && resume?.team && (
        <section aria-label="Equipo" className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-600">Equipo</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Facturado del equipo:{' '}
            <span className="font-semibold">
              {resume.team.totals.invoiced.amount} {resume.team.totals.invoiced.currency}
            </span>{' '}
            — {invoiceSourceLabel(resume.team.totals.invoiced)}
          </p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {resume.team.members.map((member) => (
              <li key={member.userId}>
                {member.name}: facturado {member.invoiced.amount} {member.invoiced.currency}
              </li>
            ))}
          </ul>
        </section>
      )}

      {libraryStats?.products && (
        <section aria-label="Estadísticas de Productos" className="rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-600">
              <span className="text-[#CE0203]">■</span> Biblioteca · Productos
            </h2>
            {catalog.tabs.some((tab) => tab.to === PRODUCTS_TAB_PATH) && (
              <Link to={PRODUCTS_TAB_PATH} className="text-sm text-neutral-700 underline">
                Ver Productos
              </Link>
            )}
          </div>
          <div className="mt-2">
            <StatCard label="Total de productos" value={libraryStats.products.total} />
          </div>
          <h3 className="mt-3 text-xs font-medium text-neutral-600">Estado del catálogo</h3>
          <div className="mt-1 grid grid-cols-3 gap-3">
            <StatCard label="Publicados" value={libraryStats.products.published} />
            <StatCard label="En borrador" value={libraryStats.products.draft} />
            <StatCard label="Archivados" value={libraryStats.products.archived} />
          </div>
          <h3 className="mt-3 text-xs font-medium text-neutral-600">Necesitan atención</h3>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <StatCard label="Sin imagen" value={libraryStats.products.withoutImage} />
            <StatCard label="Sin precio" value={libraryStats.products.withoutPrice} />
          </div>
        </section>
      )}

      {libraryStats?.update && (
        <section aria-label="Estadísticas de Fichas" className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-600">
            <span className="text-[#CE0203]">■</span> Estadísticas de Fichas
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Fichas sin validar" value={libraryStats.update.unvalidated} />
            <StatCard label="Sin actualizar hace 30 días o más" value={libraryStats.update.notUpdated30Days} />
            <StatCard label="Revisiones de precios sin aplicar" value={libraryStats.update.pendingPriceRevisions} />
            <StatCard label="Última revisión de precios aplicada" value={formatDate(libraryStats.update.lastPriceRevisionAppliedAt)} />
            <StatCard label="Trabajos en cola" value={libraryStats.update.jobsQueued} />
            <StatCard label="Trabajos en ejecución" value={libraryStats.update.jobsRunning} />
          </div>
        </section>
      )}

      {libraryStats?.publication && (
        <section aria-label="Estadísticas de Publicación" className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-600">
            <span className="text-[#CE0203]">■</span> Estadísticas de Publicación
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Pendientes de publicar" value={libraryStats.publication.pending} />
            <StatCard label="Con problemas" value={libraryStats.publication.withIssues} />
            <StatCard label="Publicados" value={libraryStats.publication.published} />
          </div>
          {libraryStats.publication.latestPublished.length > 0 && (
            <>
              <h3 className="mt-3 text-xs font-medium text-neutral-600">Últimos publicados</h3>
              <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {libraryStats.publication.latestPublished.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    {item.name} · {formatDate(item.publishedAt)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {(goalQuery.isPending && goalQuery.fetchStatus !== 'idle') ||
      (resumeQuery.isPending && resumeQuery.fetchStatus !== 'idle') ? (
        <p className="text-sm text-neutral-500">Cargando el resumen…</p>
      ) : null}
      {(goalQuery.isError || resumeQuery.isError) && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo cargar el resumen. Vuelve a intentarlo.
        </p>
      )}
    </main>
  )
}

export default AssignedHome

function SellerHome({ userId, roles }: { userId: string; roles: readonly string[] }) {
  const { access, status } = useOwnUserAccess()
  const canReadAgenda = hasAssignedAction({ roles, grants: access?.grants, status }, ['activities:read'])
  const agenda = useQuery({
    queryKey: agendaActivitiesKey(userId),
    queryFn: fetchAgendaActivities,
    enabled: canReadAgenda,
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const counts = { overdue: 0, today: 0, upcoming: 0 }
  for (const activity of agenda.data ?? []) {
    if (activity.assigneeId !== userId || activity.status !== 'PENDING') continue
    const startsAt = new Date(activity.startsAt)
    if (!Number.isFinite(startsAt.getTime())) continue
    if (startsAt < today) counts.overdue += 1
    else if (startsAt < tomorrow) counts.today += 1
    else counts.upcoming += 1
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Mi resumen</h1>
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="text-lg font-semibold">Agenda y tareas</h2>
        {!canReadAgenda && <p role="status">Tu cuenta no tiene acceso a la agenda.</p>}
        {canReadAgenda && (
          <>
            {agenda.isPending && <p role="status">Cargando tus actividades…</p>}
            {agenda.isError && (
              <div role="alert">
                <p>No pudimos cargar tus actividades.</p>
                <button type="button" className="min-h-11 underline" onClick={() => void agenda.refetch()}>Reintentar</button>
              </div>
            )}
            {agenda.isSuccess && (
              <>
                <dl className="my-4 grid grid-cols-3 gap-3">
                  <div><dt>Vencidas</dt><dd className="text-2xl font-semibold">{counts.overdue}</dd></div>
                  <div><dt>Hoy</dt><dd className="text-2xl font-semibold">{counts.today}</dd></div>
                  <div><dt>Próximas</dt><dd className="text-2xl font-semibold">{counts.upcoming}</dd></div>
                </dl>
                {counts.overdue + counts.today + counts.upcoming === 0 && <p>No tienes actividades pendientes.</p>}
              </>
            )}
            <Link className="inline-flex min-h-11 items-center underline" to="/agenda">Abrir agenda completa</Link>
          </>
        )}
      </section>
    </main>
  )
}
