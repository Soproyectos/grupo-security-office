import { useQuery } from '@tanstack/react-query'
import {
  DASHBOARD_GOAL_QUERY_KEY,
  DASHBOARD_RESUME_QUERY_KEY,
  fetchMyWorkspace,
  fetchPersonalSalesGoal,
  invoiceSourceLabel,
} from '../services/dashboard-insights.service'

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
  const goalQuery = useQuery({
    queryKey: DASHBOARD_GOAL_QUERY_KEY,
    queryFn: fetchPersonalSalesGoal,
    retry: false,
    staleTime: 60_000,
  })
  const resumeQuery = useQuery({
    queryKey: DASHBOARD_RESUME_QUERY_KEY,
    queryFn: fetchMyWorkspace,
    retry: false,
    staleTime: 60_000,
  })

  const goal = goalQuery.data
  const resume = resumeQuery.data

  return (
    <main aria-label="Mi resumen asignado" className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Mi resumen</h1>

      {goal && (
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

      {resume?.commercial && (
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

      {resume && (
        <section aria-label="Actividad" className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-600">Actividad</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <li>Listas: {resume.kpis.listas}</li>
            <li>Productos: {resume.kpis.products}</li>
            <li>Pendientes de publicación: {resume.kpis.pendingPublication}</li>
            <li>Actividad reciente: {resume.kpis.recentActivity}</li>
          </ul>
        </section>
      )}

      {/* A2: el bloque existe SOLO si la API lo trajo; nada se inventa. */}
      {resume?.team && (
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

      {!goal && !resume && !goalQuery.isError && !resumeQuery.isError && (
        <p className="text-sm text-neutral-500">Cargando el resumen…</p>
      )}
      {(goalQuery.isError || resumeQuery.isError) && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo cargar el resumen. Vuelve a intentarlo.
        </p>
      )}
    </main>
  )
}

export default AssignedHome
