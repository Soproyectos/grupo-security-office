import { useRef, useState } from 'react'
import { Card } from '../../components/ui'

const tasks = [
  { id: 'invoice-overdue', group: 'Facturas', label: 'Factura vencida', customer: 'Edificio Los Robles · prueba', record: 'FAC-PRUEBA-1042', amount: '$ 1.250.000', detail: 'Saldo pendiente · venció el 2 de octubre', action: 'Contactar al cliente para acordar el pago y registrar el seguimiento.', urgent: true },
  { id: 'quote-expiry', group: 'Seguimientos', label: 'Cotización por vencer', customer: 'Integraciones Norte · prueba', record: 'COT-PRUEBA-208', amount: '$ 3.480.000', detail: 'Vence mañana, 6 de octubre', action: 'Confirmar si el cliente necesita ajustes o está listo para aprobar la cotización.', urgent: true },
  { id: 'contact', group: 'Seguimientos', label: 'Cliente por contactar', customer: 'Conjunto Alameda · prueba', record: 'Seguimiento comercial', amount: '', detail: 'Hoy · 2:30 p. m.', action: 'Llamar para confirmar las necesidades del proyecto y el próximo paso.', urgent: false },
  { id: 'quote-followup', group: 'Seguimientos', label: 'Cotización sin seguimiento', customer: 'Comercial Andina · prueba', record: 'COT-PRUEBA-205', amount: '$ 940.000', detail: 'Último contacto: hace 4 días', action: 'Consultar si revisó la propuesta y registrar una nueva fecha de contacto.', urgent: false },
  { id: 'invoice-open', group: 'Facturas', label: 'Factura pendiente de pago', customer: 'Oficinas Horizonte · prueba', record: 'FAC-PRUEBA-1048', amount: '$ 840.000', detail: 'Vence el 9 de octubre · saldo pendiente', action: 'Recordar la fecha de pago al cliente. Aún no está vencida.', urgent: false },
] as const

export default function SalesWorkspacePreview() {
  const [filter, setFilter] = useState('Todos')
  const [completed, setCompleted] = useState<string[]>([])
  const [selected, setSelected] = useState<(typeof tasks)[number] | null>(null)
  const details = useRef<HTMLDialogElement>(null)
  const flyer = useRef<HTMLDialogElement>(null)
  const pending = tasks.filter(task => !completed.includes(task.id))
  const visible = pending.filter(task => filter === 'Todos' || task.group === filter)
  const openTask = (task: (typeof tasks)[number]) => { setSelected(task); details.current?.showModal() }
  return (
    <div className="space-y-5">
      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Vista de prueba · clientes, saldos y fechas ficticios · las acciones no modifican registros reales.
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
        <aside aria-label="Flyer de promociones" className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
            <div className="border-b border-[var(--color-border)] px-4 py-3"><h2 className="font-condensed text-lg font-semibold">Promoción del mes</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">Campaña de demostración</p></div>
            <button type="button" aria-label="Ampliar flyer de prueba" className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]" onClick={() => flyer.current?.showModal()}>
              <img src="/sales-promotion-preview.svg" alt="Flyer de prueba: soluciones de videovigilancia Grupo Security" className="h-auto w-full" />
            </button>
            <p className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">Pulsa la imagen para verla en grande.</p>
          </div>
        </aside>
        <div className="order-1 min-w-0 space-y-5 lg:order-2">
          <div><h1 className="font-condensed text-2xl font-semibold">Mi espacio de ventas</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Organiza tus ventas y atiende primero lo que necesita seguimiento.</p></div>
          <Card>
            <h2 className="font-condensed text-lg font-semibold">Mi meta de ventas mensual</h2>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Octubre de 2026 · datos de prueba</p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              {[['Meta asignada', '$ 12.000.000'], ['Facturado del mes', '$ 7.800.000'], ['Falta para la meta', '$ 4.200.000']].map(([label,value]) => <div key={label}><dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}
            </dl>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Avance mensual de prueba" aria-valuemin={0} aria-valuemax={100} aria-valuenow={65}><div className="h-full w-[65%] bg-[var(--color-primary)]" /></div>
            <p className="mt-2 text-xs">65% de avance</p>
          </Card>
          <div className="grid grid-cols-2 gap-4">{[['Mis clientes', '24'], ['Mis cotizaciones', '8']].map(([label,count]) => <Card key={label}><h2 className="text-sm font-medium text-[var(--color-primary)]">{label}</h2><p className="mt-2 text-2xl font-semibold">{count}</p></Card>)}</div>
          <section aria-labelledby="demo-recent-quotes"><h2 id="demo-recent-quotes" className="mb-3 font-condensed text-lg font-semibold">Mis cotizaciones recientes</h2>
            <Card padding="none"><ul className="divide-y divide-[var(--color-border)]">
              {tasks.filter(task => task.id.startsWith('quote')).map(task => <li key={task.id}><button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-[var(--color-bg-primary)]" onClick={() => openTask(task)}>
                <div><p className="text-sm font-medium">{task.customer}</p><p className="mt-1 text-xs text-[var(--color-text-secondary)]">{task.record}</p></div><span className="whitespace-nowrap text-sm">{task.amount}</span>
              </button></li>)}
            </ul></Card>
          </section>
        </div>
        <aside aria-labelledby="pending-heading" className="order-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
          <div className="border-b border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between"><h2 id="pending-heading" className="font-condensed text-xl font-semibold">Mis pendientes</h2><span className="rounded-full bg-[var(--color-primary-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)]">{pending.length}</span></div>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Lunes 5 de octubre · por prioridad</p>
            <div className="mt-3 flex gap-1">{['Todos','Facturas','Seguimientos'].map(option => <button type="button" key={option} aria-pressed={filter === option} onClick={() => setFilter(option)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium ${filter === option ? 'bg-[var(--color-primary)] text-white' : 'bg-neutral-100 text-neutral-600'}`}>{option}</button>)}</div>
          </div>
          <ul className="divide-y divide-[var(--color-border)]">{visible.map(task => <li key={task.id}><button type="button" onClick={() => openTask(task)} className="block w-full p-4 text-left transition-colors hover:bg-[var(--color-bg-primary)]">
            <span className={`inline-block rounded px-2 py-1 text-[10px] font-semibold ${task.urgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{task.label}</span>
            <p className="mt-2 text-sm font-semibold">{task.customer}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{task.record}</p>
            {task.amount && <p className="mt-1 text-sm font-semibold">{task.amount}</p>}
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{task.detail}</p>
            <span className="mt-2 inline-block text-xs font-medium text-[var(--color-primary)]">Ver pendiente →</span>
          </button></li>)}</ul>
          {!visible.length && <p className="p-5 text-sm text-[var(--color-text-secondary)]">No hay pendientes en este filtro.</p>}
        </aside>
      </div>
      <dialog ref={details} aria-label="Detalle del pendiente de prueba" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border-0 p-6 shadow-xl backdrop:bg-black/60">
        {selected && <><div className="flex justify-between gap-4"><h2 className="text-lg font-semibold">{selected.label}</h2><button type="button" aria-label="Cerrar detalle" onClick={() => details.current?.close()}>✕</button></div>
          <p className="mt-3 font-medium">{selected.customer}</p><p className="mt-1 text-sm">{selected.record} {selected.amount}</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{selected.detail}</p>
          <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm">{selected.action}</p>
          <p className="mt-3 text-xs text-amber-800">Simulación: no registra pagos ni modifica facturas o cotizaciones reales.</p>
          <button type="button" className="mt-5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white" onClick={() => { setCompleted(value => [...value,selected.id]); details.current?.close() }}>Marcar atendido · prueba</button>
        </>}
      </dialog>
      <dialog ref={flyer} aria-label="Flyer de prueba" className="m-auto max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/60"><div className="relative">
        <img src="/sales-promotion-preview.svg" alt="Flyer de prueba de Grupo Security" className="max-h-[85vh] max-w-[calc(100vw_-_3rem)]" />
        <button type="button" aria-label="Cerrar flyer de prueba" className="absolute -right-3 -top-3 h-8 w-8 rounded-full border-2 border-neutral-800 bg-white text-xl text-neutral-900" onClick={() => flyer.current?.close()}>×</button>
      </div></dialog>
    </div>
  )
}

