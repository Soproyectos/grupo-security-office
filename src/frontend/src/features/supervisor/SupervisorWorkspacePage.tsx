import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'

const initialTeam = [
  { id: 'demo-a', name: 'Vendedor de prueba A', target: 12000000, invoiced: 7800000, quotes: 8 },
  { id: 'demo-b', name: 'Vendedor de prueba B', target: 10000000, invoiced: 4300000, quotes: 5 },
  { id: 'demo-c', name: 'Vendedor de prueba C', target: 8000000, invoiced: 6200000, quotes: 3 },
]
const initialTasks = [
  { id: 'discount', title: 'Revisar solicitud de descuento', seller: 'Vendedor de prueba A', detail: 'COT-PRUEBA-001 · El cliente solicita 5%. Revisar margen y tarifa antes de autorizar.' },
  { id: 'quote', title: 'Cotización próxima a vencer', seller: 'Vendedor de prueba B', detail: 'COT-PRUEBA-002 · Confirmar decisión del cliente y programar seguimiento.' },
  { id: 'invoice', title: 'Coordinar seguimiento de cartera', seller: 'Vendedor de prueba C', detail: 'FAC-PRUEBA-003 · Saldo ficticio de $840.000. Validar con cartera antes de contactar.' },
]
const money = (amount: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)

export default function SupervisorWorkspacePage() {
  const user = useAuthStore(state => state.user)
  const [team, setTeam] = useState(initialTeam)
  const [tasks, setTasks] = useState(initialTasks)
  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  if (!user?.roles.some(role => role === 'Supervisor' || role === 'Super Admin')) return <Navigate to="/" replace />
  if (!import.meta.env.DEV) return <p>La vista de prueba del Supervisor está disponible en desarrollo.</p>
  const totalTarget = team.reduce((sum, seller) => sum + seller.target, 0)
  const totalInvoiced = team.reduce((sum, seller) => sum + seller.invoiced, 0)
  const card = 'rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm'
  return <div className="space-y-6">
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Vista de prueba · vendedores, metas, facturas y seguimientos ficticios. Los cambios se reinician al recargar y no modifican registros reales.</div>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-condensed font-semibold">Mi equipo comercial</h1><p className="mt-1 text-sm text-neutral-500">Supervisor · octubre de 2026 · organiza el trabajo y acompaña a tus vendedores.</p></div></header>
    <div className="grid gap-4 sm:grid-cols-3">{[
      ['Vendedores del equipo', String(team.length)], ['Meta mensual del equipo', money(totalTarget)], ['Facturado del equipo · prueba', money(totalInvoiced)],
    ].map(([label, value]) => <div key={label} className={card}><p className="text-sm text-neutral-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className={card} aria-labelledby="team-heading"><div className="mb-5"><h2 id="team-heading" className="text-xl font-condensed font-semibold">Avance por vendedor</h2><p className="mt-1 text-sm text-neutral-500">Asigna metas y detecta quién necesita acompañamiento.</p></div>
        <div className="space-y-4">{team.map(seller => {
          const progress = seller.target > 0 ? Math.round(seller.invoiced / seller.target * 100) : 0
          return <article key={seller.id} className="rounded-lg border border-neutral-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{seller.name}</h3><p className="text-xs text-neutral-500">{seller.quotes} cotizaciones abiertas · datos de prueba</p></div><button type="button" onClick={() => {setEditing(seller.id); setAmount(String(seller.target)); setError('')}} className="text-sm font-semibold text-[var(--color-primary)]">Editar meta de {seller.name}</button></div>
            <dl className="my-4 grid gap-3 sm:grid-cols-3"><div><dt className="text-xs text-neutral-500">Meta</dt><dd className="font-semibold">{money(seller.target)}</dd></div><div><dt className="text-xs text-neutral-500">Facturado</dt><dd className="font-semibold">{money(seller.invoiced)}</dd></div><div><dt className="text-xs text-neutral-500">Falta para la meta</dt><dd className="font-semibold">{money(Math.max(0, seller.target - seller.invoiced))}</dd></div></dl>
            <progress aria-label={`Avance de ${seller.name}`} max={100} value={Math.min(progress, 100)} className="h-2 w-full accent-[var(--color-primary)]" /><p className="mt-1 text-xs text-neutral-500">{progress}% de avance</p>
            {editing === seller.id && <form className="mt-4 space-y-3 rounded-lg bg-neutral-50 p-3" onSubmit={event => {event.preventDefault(); const value=Number(amount); if(!amount.trim() || !Number.isFinite(value) || value <= 0){setError('Ingresa una meta mayor que cero.'); return}setTeam(previous => previous.map(item => item.id === seller.id ? {...item,target:value} : item));setEditing(null);setNotice(`Meta de prueba actualizada para ${seller.name}.`)}}><label className="block text-sm">Meta mensual en COP<input type="number" min="1" step="1" required value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-neutral-300 p-2" /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-3"><button className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm text-white">Guardar meta · prueba</button><button type="button" onClick={() => setEditing(null)} className="text-sm">Cancelar</button></div></form>}
          </article>
        })}</div><p aria-live="polite" className="mt-3 text-sm text-neutral-600">{notice}</p>
      </section>
      <aside className={card} aria-labelledby="team-pending-heading"><h2 id="team-pending-heading" className="text-xl font-condensed font-semibold">Pendientes del equipo</h2><p className="mt-1 text-sm text-neutral-500">{tasks.length} por revisar · simulación</p><ul className="mt-4 divide-y divide-neutral-200">{tasks.map(task => <li key={task.id} className="py-4"><h3 className="text-sm font-semibold">{task.title}</h3><p className="mt-1 text-xs text-[var(--color-primary)]">{task.seller}</p><p className="mt-2 text-sm leading-relaxed text-neutral-500">{task.detail}</p><button type="button" onClick={() => {setTasks(previous => previous.filter(item => item.id !== task.id)); setNotice('Pendiente atendido en la simulación. No se autorizó ningún descuento ni se registró un pago.')}} className="mt-3 text-sm font-semibold text-[var(--color-primary)]">Marcar revisado · prueba</button></li>)}</ul>{!tasks.length && <p className="mt-4 text-sm">No quedan pendientes en esta simulación.</p>}</aside>
    </div>
  </div>
}
