import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { hasAssignedAction, useOwnUserAccess } from '../users/access'
import { promotionDate, promotionLocalTimeToIso } from '../promotions/promotions.service'

type Person = { id: string; name: string }
type Entry = {
  id: string
  title?: string
  detail?: string
  kind: string
  startsAt?: string
  createdAt: string
  status: string
  response?: string
  assignee?: Person
  creator: Person
  reviewer?: Person
}

const kinds: Record<string, string> = {
  CALL: 'Llamada', VISIT: 'Visita a proyecto', FOLLOW_UP: 'Seguimiento',
  INCORPORATION: 'Incorporación de vendedor', ACCOUNT: 'Creación de cuenta',
  REASSIGNMENT: 'Reasignación de vendedor',
}
const states: Record<string, string> = {
  PENDING: 'Pendiente', COMPLETED: 'Completada', APPROVED: 'Aprobada', REJECTED: 'Rechazada',
}

export default function TeamWorkflowPage({ kind }: { kind: 'agenda' | 'requests' }) {
  const agenda = kind === 'agenda'
  const user = useAuthStore(state => state.user)
  const admin = user?.roles?.includes('Super Admin') ?? false
  const { access, status: accessStatus } = useOwnUserAccess()
  const can = (action: string) => admin || hasAssignedAction({
    roles: user?.roles,
    grants: access?.grants,
    status: accessStatus,
  }, [action])
  const canRead = can('activities:read')
  const canCreate = can('activities:create')
  const canComplete = can('activities:complete')
  const canAssign = can('activities:assign')
  const client = useQueryClient()
  const base = '/team-workflow'
  const endpoint = agenda ? 'activities' : 'requests'
  const queryKey = ['team-workflow', endpoint, user?.id]
  const entries = useQuery({
    queryKey,
    enabled: agenda ? canRead : admin,
    queryFn: async () => (await api.get(`${base}/${endpoint}`)).data as Entry[],
    refetchInterval: 30_000,
  })
  const people = useQuery({
    queryKey: ['workflow-sellers', user?.id],
    enabled: agenda && canAssign,
    queryFn: async () => (await api.get(`${base}/sellers`)).data as Person[],
  })
  const [detail, setDetail] = useState('')
  const [assignee, setAssignee] = useState('')
  const [activityType, setActivityType] = useState('CALL')
  const [date, setDate] = useState('')
  const [filter, setFilter] = useState('')
  const [day, setDay] = useState('')
  const [reply, setReply] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const anchor = new Date(`${day || new Date(Date.now() - 18_000_000).toISOString().slice(0, 10)}T00:00:00Z`)
  const week = Array.from({ length: 7 }, (_, index) => new Date(anchor.getTime() + index * 86_400_000).toISOString().slice(0, 10))
  const list = (entries.data ?? []).filter(entry =>
    (!filter || entry.status === filter) && (!agenda || !day ||
      new Date(new Date(entry.startsAt!).getTime() - 18_000_000).toISOString().slice(0, 10) === day),
  )

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      await client.invalidateQueries({ queryKey })
      setMessage(success)
    } catch {
      setMessage('No se pudo guardar. Revisa tu acceso o vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  if (agenda && accessStatus === 'loading') return <p role="status">Cargando tus accesos…</p>
  if (agenda && accessStatus === 'unavailable') return <p role="alert">No se pudieron comprobar tus accesos a la agenda.</p>
  if (agenda && !canRead) return <p role="status" className="rounded-lg border p-4">No tienes asignada la consulta de agenda.</p>
  if (!agenda && !admin) return <p role="status" className="rounded-lg border p-4">Las peticiones de supervisores están reservadas a Super Admin mientras se define su permiso.</p>

  return <div className="space-y-5">
    <header>
      <h1 className="text-3xl font-condensed font-semibold">{agenda ? (canAssign ? 'Agenda del equipo' : 'Mi agenda') : 'Peticiones de supervisores'}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {agenda
          ? (canAssign ? 'Consulta y asigna actividades dentro del equipo autorizado.' : 'Consulta y completa tus actividades autorizadas.')
          : 'La revisión de peticiones está reservada a Super Admin mientras se define una acción asignable.'}
      </p>
    </header>
    {message && <p role="status" className="rounded-lg bg-neutral-100 p-3">{message}</p>}
    {(entries.isError || people.isError) && <p role="alert">No se pudieron cargar los datos. <button type="button" onClick={() => { void entries.refetch(); if (agenda && canAssign) void people.refetch() }}>Reintentar</button></p>}

    {agenda && <section aria-label="Calendario de actividades" className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Calendario de actividades · Colombia</h2>
        <div className="space-x-3">
          <button type="button" onClick={() => setDay(new Date(anchor.getTime() - 7 * 86_400_000).toISOString().slice(0, 10))}>Semana anterior</button>
          <button type="button" onClick={() => setDay(new Date(anchor.getTime() + 7 * 86_400_000).toISOString().slice(0, 10))}>Semana siguiente</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        {week.map(dateValue => {
          const scheduled = (entries.data ?? []).filter(entry => new Date(new Date(entry.startsAt!).getTime() - 18_000_000).toISOString().slice(0, 10) === dateValue)
          return <button type="button" key={dateValue} onClick={() => setDay(dateValue)} className={`min-h-28 rounded-lg border p-3 text-left ${day === dateValue ? 'border-[var(--color-primary)] bg-red-50' : 'border-neutral-200'}`}>
            <span className="block text-sm font-semibold">{new Date(`${dateValue}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' })}</span>
            {scheduled.length ? scheduled.map(entry => <span key={entry.id} className="mt-2 block truncate text-xs">{new Date(entry.startsAt!).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })} · {entry.title}</span>) : <span className="mt-3 block text-xs text-neutral-400">Sin actividades</span>}
          </button>
        })}
      </div>
    </section>}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap gap-3">
          <label>Estado <select aria-label="Estado" value={filter} onChange={event => setFilter(event.target.value)} className="rounded border p-2"><option value="">Todos</option>{Object.entries(states).filter(([key]) => agenda ? ['PENDING', 'COMPLETED'].includes(key) : key !== 'COMPLETED').map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          {agenda && <label>Calendario · Colombia <input aria-label="Día del calendario" type="date" value={day} onChange={event => setDay(event.target.value)} className="rounded border p-2" /><button type="button" className="ml-2 text-sm" onClick={() => setDay('')}>Ver todas</button></label>}
        </div>
        {entries.isPending ? <p className="mt-5">Cargando…</p> : !list.length ? <p className="mt-5">No hay {agenda ? 'actividades' : 'peticiones'} para esta selección.</p> : <ul className="mt-3 divide-y">
          {list.map(entry => <li key={entry.id} className="space-y-2 py-4">
            <div className="flex justify-between gap-3"><h2 className="font-semibold">{entry.title ?? entry.detail}</h2><span className="text-sm">{states[entry.status] ?? entry.status}</span></div>
            <p className="text-sm text-neutral-500">{kinds[entry.kind] ?? entry.kind} · {agenda ? entry.assignee?.name : entry.creator.name}</p>
            <p className="text-sm">{promotionDate(entry.startsAt ?? entry.createdAt)} · Colombia</p>
            {agenda && entry.creator.id !== entry.assignee?.id && <p className="text-xs">Asignada por {entry.creator.name}</p>}
            {agenda && canComplete && entry.status === 'PENDING' && <button type="button" disabled={busy} className="text-sm font-semibold text-[var(--color-primary)]" onClick={() => void act(() => api.patch(`${base}/activities/${entry.id}/complete`), 'Actividad completada.')}>Marcar completada</button>}
            {entry.response && <p className="rounded bg-neutral-50 p-3 text-sm">Respuesta de {entry.reviewer?.name}: {entry.response}</p>}
            {!agenda && entry.status === 'PENDING' && <div className="space-y-2">
              <label className="block text-sm">Respuesta<textarea aria-label={`Respuesta a ${entry.detail}`} required maxLength={2000} className="mt-1 w-full rounded border p-2" value={reply[entry.id] ?? ''} onChange={event => setReply(previous => ({ ...previous, [entry.id]: event.target.value }))} /></label>
              {(['APPROVED', 'REJECTED'] as const).map(status => <button type="button" key={status} disabled={busy || !reply[entry.id]?.trim()} className="mr-3 rounded border px-3 py-2 text-sm" onClick={() => void act(() => api.patch(`${base}/requests/${entry.id}/review`, { status, response: reply[entry.id]?.trim() }), 'Respuesta guardada.')}>{status === 'APPROVED' ? 'Aprobar petición' : 'Rechazar petición'}</button>)}
            </div>}
          </li>)}
        </ul>}
      </section>

      {agenda && (canCreate || canAssign) && <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={event => {
        event.preventDefault()
        const assigneeId = canAssign ? assignee : user?.id
        if (!assigneeId) return
        void act(async () => {
          await api.post(`${base}/activities`, { title: detail, kind: activityType, assigneeId, startsAt: promotionLocalTimeToIso(date) })
          setDetail('')
        }, 'Actividad guardada en la agenda.')
      }}>
        <h2 className="text-xl font-semibold">{canAssign ? 'Asignar actividad' : 'Crear actividad propia'}</h2>
        {canAssign && <label className="block text-sm">Vendedor<select required value={assignee} onChange={event => setAssignee(event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">Selecciona un vendedor</option>{people.data?.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
        <label className="block text-sm">Tipo<select value={activityType} onChange={event => setActivityType(event.target.value)} className="mt-1 w-full rounded border p-2"><option value="CALL">Llamada</option><option value="VISIT">Visita a proyecto</option><option value="FOLLOW_UP">Seguimiento</option></select></label>
        <label className="block text-sm">Actividad y lugar o referencia<textarea required maxLength={500} value={detail} onChange={event => setDetail(event.target.value)} className="mt-1 min-h-24 w-full rounded border p-2" /></label>
        <label className="block text-sm">Fecha y hora · Colombia<input required type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <button disabled={busy || entries.isError} className="w-full rounded bg-[var(--color-primary)] px-4 py-2 text-white">{busy ? 'Guardando…' : 'Guardar actividad'}</button>
      </form>}
    </div>
  </div>
}
