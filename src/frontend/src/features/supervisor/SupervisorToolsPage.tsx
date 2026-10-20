import { useState } from 'react'

type Entry = { id: number; title: string; person: string; date: string; status: string }
const sellers = ['Vendedor de prueba A', 'Vendedor de prueba B', 'Vendedor de prueba C']
const initialAgenda: Entry[] = [
  { id: 1, title: 'Llamar al cliente de COT-PRUEBA-001', person: sellers[0]!, date: '2026-10-07T10:00', status: 'Pendiente' },
  { id: 2, title: 'Revisar cotización próxima a vencer', person: sellers[1]!, date: '2026-10-07T14:30', status: 'Pendiente' },
  { id: 3, title: 'Reunión de acompañamiento comercial', person: sellers[2]!, date: '2026-10-08T09:00', status: 'Pendiente' },
]
const initialRequests: Entry[] = [
  { id: 1, title: 'Incorporar un vendedor al equipo', person: 'Solicitud ficticia de incorporación', date: '2026-10-06T09:00', status: 'Pendiente' },
  { id: 2, title: 'Reasignar seguimiento de un cliente', person: 'Ejemplo de revisión por Super Admin', date: '2026-10-05T09:00', status: 'Aprobada · ejemplo' },
]
export default function SupervisorToolsPage({ kind }: { kind: 'agenda' | 'requests' }) {
  const agenda = kind === 'agenda'
  const [entries, setEntries] = useState(agenda ? initialAgenda : initialRequests)
  const [title, setTitle] = useState('')
  const [person, setPerson] = useState(agenda ? sellers[0]! : 'Incorporación de vendedor')
  const [date, setDate] = useState('2026-10-07T10:00')
  const [filter, setFilter] = useState('Todos')
  const [message, setMessage] = useState('')
  if (!import.meta.env.DEV) return <p>Esta vista de prueba está disponible en desarrollo.</p>
  const displayed = entries.filter(entry => filter === 'Todos' || entry.status === filter)
  return <div className="space-y-6">
    <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Simulación · datos ficticios. No envía solicitudes ni notificaciones. Los cambios se reinician al salir de esta página o recargar.</p>
    <header><h1 className="text-3xl font-condensed font-semibold">{agenda ? 'Agenda del equipo' : 'Solicitudes a Super Admin'}</h1><p className="mt-2 text-sm text-neutral-500">{agenda ? 'Organiza tareas y seguimientos de los vendedores a tu cargo.' : 'Solicita incorporaciones y cambios. La decisión corresponde a Super Admin.'}</p></header>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-xl border border-neutral-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-condensed font-semibold">{agenda ? 'Seguimientos programados' : 'Mis solicitudes'}</h2><label className="text-sm">Estado <select value={filter} onChange={event => setFilter(event.target.value)} className="ml-2 rounded-lg border border-neutral-300 p-2"><option>Todos</option><option>Pendiente</option>{agenda && <option>Completada</option>}</select></label></div>
        <ul className="mt-4 divide-y divide-neutral-200">{displayed.map(entry => <li key={entry.id} className="space-y-2 py-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{entry.title}</h3><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs">{entry.status}</span></div><p className="text-sm text-neutral-500">{entry.person}</p><p className="text-xs text-neutral-500">{new Date(entry.date).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })} · hora Colombia</p>{agenda && entry.status === 'Pendiente' && <button type="button" onClick={() => {setEntries(previous => previous.map(item => item.id === entry.id ? {...item,status:'Completada'} : item));setMessage('Seguimiento completado en la simulación.')}} className="text-sm font-semibold text-[var(--color-primary)]">Completar · prueba</button>}{!agenda && <p className="text-xs text-neutral-500">{entry.status === 'Pendiente' ? 'A la espera de revisión de Super Admin.' : 'Estado ficticio para visualizar el historial; no cambia cuentas ni permisos.'}</p>}</li>)}</ul>{!displayed.length && <p className="py-6 text-sm text-neutral-500">No hay elementos con este estado.</p>}
      </section>
      <form className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5" onSubmit={event => {event.preventDefault();if(!title.trim())return;setEntries(previous => [{id:Date.now(),title:title.trim(),person,date:agenda ? date : '2026-10-06T12:00',status:'Pendiente'},...previous]);setTitle('');setFilter('Todos');setMessage(agenda ? 'Tarea añadida a la agenda de prueba.' : 'Solicitud añadida a la simulación. No fue enviada a Super Admin.')}}>
        <h2 className="text-xl font-condensed font-semibold">{agenda ? 'Asignar seguimiento' : 'Crear solicitud'}</h2>
        <label className="block text-sm">{agenda ? 'Vendedor' : 'Tipo de solicitud'}<select className="mt-1 w-full rounded-lg border border-neutral-300 p-2" value={person} onChange={event => setPerson(event.target.value)}>{(agenda ? sellers : ['Incorporación de vendedor', 'Creación de cuenta por Super Admin', 'Reasignación de vendedor']).map(option => <option key={option}>{option}</option>)}</select></label>
        <label className="block text-sm">{agenda ? 'Tarea' : 'Motivo y detalle'}<textarea required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-neutral-300 p-2" placeholder={agenda ? 'Qué debe hacer el vendedor' : 'Explica qué necesitas y por qué'} /></label>
        {agenda && <label className="block text-sm">Fecha y hora · Colombia<input required type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 p-2" /></label>}
        <button className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">{agenda ? 'Añadir tarea · prueba' : 'Registrar solicitud · prueba'}</button><p aria-live="polite" className="text-sm text-neutral-500">{message}</p>
      </form>
    </div>
  </div>
}
