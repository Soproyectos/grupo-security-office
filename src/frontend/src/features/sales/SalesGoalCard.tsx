import { useQuery } from '@tanstack/react-query'
import { Card } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { formatMoney } from '../quotes/lib/money'
import { fetchPersonalSalesGoal, type PersonalSalesGoal } from './sales-goal.service'

export function SalesGoalSummary({ goal }: { goal: PersonalSalesGoal }) {
  const percent = goal.progressPercent
  const reached = percent !== null && percent >= 100
  const month = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${goal.period}-01T00:00:00Z`))
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold">Mi meta de ventas mensual</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{month}</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm text-[var(--color-text-secondary)]">Meta asignada</dt>
          <dd className="mt-1 text-xl font-semibold">{goal.target ? formatMoney(goal.target.amount, goal.target.currency) : 'Sin meta asignada'}</dd></div>
        <div><dt className="text-sm text-[var(--color-text-secondary)]">Facturado del mes ({goal.invoiced.currency})</dt>
          <dd className="mt-1 text-xl font-semibold">{formatMoney(goal.invoiced.amount, goal.invoiced.currency)}</dd></div>
        <div><dt className="text-sm text-[var(--color-text-secondary)]">Falta para la meta</dt>
          <dd className="mt-1 text-xl font-semibold">{goal.remaining ? formatMoney(goal.remaining.amount, goal.remaining.currency) : '—'}</dd></div>
      </dl>
      {percent !== null && (
        <div className="mt-4">
          <div role="progressbar" aria-label="Avance de mi meta mensual" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.min(percent, 100)} aria-valuetext={`${percent}% de la meta`}
            className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
            <div className={`h-full ${reached ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'}`}
              style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
          <p className="mt-2 text-sm font-medium">{percent}% de avance{reached ? ' · Meta alcanzada' : ''}</p>
        </div>
      )}
      {!goal.target && <p className="mt-3 text-sm">Tu Supervisor o Super Admin puede asignarte la meta de este mes.</p>}
      {goal.target && percent === null && !goal.invoiced.mixedCurrency && <p className="mt-3 text-sm">La meta es cero; no se calcula un porcentaje de avance.</p>}
      {goal.invoiced.mixedCurrency && <p role="status" className="mt-3 text-sm">Hay facturas en otras monedas. Se muestra solo el facturado en {goal.invoiced.currency}; el avance no se compara sin una conversión autorizada.</p>}
      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Se cuentan tus pedidos con número y fecha de factura registrados este mes. Las cotizaciones abiertas no cuentan como ventas facturadas.</p>
    </Card>
  )
}

export default function SalesGoalCard() {
  const userId = useAuthStore(state => state.user?.id)
  const query = useQuery({
    queryKey: ['sales', 'goal', userId],
    queryFn: fetchPersonalSalesGoal,
    enabled: !!userId,
    refetchInterval: 60_000,
  })
  if (query.isPending) return <Card><p aria-busy="true">Cargando mi meta mensual…</p></Card>
  if (query.isError) return <Card><p role="alert">No se pudo cargar tu meta mensual.</p>
    <button type="button" className="mt-2 underline" onClick={() => void query.refetch()}>Reintentar</button></Card>
  return <SalesGoalSummary goal={query.data} />
}
