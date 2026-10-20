import { useQuery } from '@tanstack/react-query'
import {
  DASHBOARD_RESUME_QUERY_KEY,
  fetchMyWorkspace,
  invoiceSourceLabel,
} from '../services/dashboard-insights.service'

/**
 * COM-05 frontend — Reportes asignados (AssignedReportsPage).
 *
 * Tabla del equipo con META y FACTURADO en columnas separadas (nunca una suma
 * conjunta — contrato §3 «sin doble conteo»), facturación con la etiqueta de
 * fuente visible y aviso de monedas mixtas. A2: si la API no devuelve `team`
 * (sin `teamInsights:read`), estado vacío honesto — CERO filas inventadas.
 */
export function AssignedReportsPage() {
  const resumeQuery = useQuery({
    queryKey: DASHBOARD_RESUME_QUERY_KEY,
    queryFn: fetchMyWorkspace,
    retry: false,
    staleTime: 60_000,
  })

  const team = resumeQuery.data?.team

  if (resumeQuery.isError) {
    return (
      <main aria-label="Reportes asignados" className="mx-auto max-w-5xl p-4">
        <h1 className="text-2xl font-semibold">Reportes asignados</h1>
        <p role="alert" className="mt-4 text-sm text-red-700">
          No se pudieron cargar los reportes. Vuelve a intentarlo.
        </p>
      </main>
    )
  }

  if (!team) {
    return (
      <main aria-label="Reportes asignados" className="mx-auto max-w-5xl p-4">
        <h1 className="text-2xl font-semibold">Reportes asignados</h1>
        <p className="mt-4 rounded-lg border border-neutral-200 p-4 text-sm text-neutral-600">
          {resumeQuery.isLoading ? 'Cargando reportes…' : 'Sin datos de equipo disponibles'}
        </p>
      </main>
    )
  }

  return (
    <main aria-label="Reportes asignados" className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Reportes asignados</h1>

      <p className="text-xs text-neutral-500">
        Facturado: {invoiceSourceLabel(team.totals.invoiced)} — las cifras son referencia manual de
        factura; el ERP todavía no está conectado a esta fuente.
      </p>
      {team.totals.invoiced.mixedCurrency && (
        <p className="text-xs text-amber-700">
          Monedas mixtas entre miembros: los importes no se suman en un solo total.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
              <th className="p-3 font-medium">Miembro</th>
              <th className="p-3 font-medium">Meta</th>
              <th className="p-3 font-medium">Facturado</th>
              <th className="p-3 font-medium">Restante</th>
              <th className="p-3 font-medium">Oportunidades abiertas</th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((member) => (
              <tr key={member.userId} className="border-b border-neutral-100">
                <td className="p-3">{member.name}</td>
                <td className="p-3">
                  {member.target ? `${member.target.amount} ${member.target.currency}` : '—'}
                </td>
                <td className="p-3" data-testid={`facturado-${member.userId}`}>
                  {member.invoiced.amount} {member.invoiced.currency}
                  {member.invoiced.mixedCurrency && (
                    <span className="ml-1 text-xs text-amber-700">(moneda mixta)</span>
                  )}
                </td>
                <td className="p-3">
                  {member.remaining ? `${member.remaining.amount} ${member.remaining.currency}` : '—'}
                </td>
                <td className="p-3">
                  {member.pipeline.count} ({member.pipeline.amount} {member.invoiced.currency})
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-neutral-50 font-medium">
              <td className="p-3">Totales</td>
              <td className="p-3">
                {team.totals.target.amount} {team.totals.target.currency}
              </td>
              <td className="p-3">
                {team.totals.invoiced.amount} {team.totals.invoiced.currency}
              </td>
              <td className="p-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  )
}

export default AssignedReportsPage
