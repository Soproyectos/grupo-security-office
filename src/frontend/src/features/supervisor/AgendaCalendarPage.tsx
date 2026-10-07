import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { promotionDate, promotionLocalTimeToIso } from '../promotions/promotions.service'
import { addDays, colombiaDay, monthDays, moveMonth, taskGroup, weekDays } from './calendar-dates'

type Person = {id:string; name:string}
type Activity = {id:string; title:string; kind:string; startsAt:string; status:string; assignee:Person; creator:Person}
const types = {CALL:'Llamada', VISIT:'Visita a proyecto', FOLLOW_UP:'Seguimiento'}
const colors:Record<string,string> = {CALL:'border-blue-200 bg-blue-50 text-blue-900', VISIT:'border-emerald-200 bg-emerald-50 text-emerald-900', FOLLOW_UP:'border-amber-200 bg-amber-50 text-amber-900'}
const weekdays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const inputStyle = 'mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm'
const buttonStyle = 'rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600'
function dayLabel(day:string, options:Intl.DateTimeFormatOptions) {
 return new Intl.DateTimeFormat('es-CO',{...options,timeZone:'America/Bogota'}).format(new Date(`${day}T12:00:00Z`))
}
export default function AgendaCalendarPage() {
 const user = useAuthStore(s=>s.user)
 const supervisor = user?.roles?.some(r=>['Supervisor','Super Admin'].includes(r)) ?? false
 const today = colombiaDay()
 const [anchor,setAnchor] = useState(today)
 const [mode,setMode] = useState<'calendar'|'tasks'>('calendar')
 const [view,setView] = useState<'month'|'week'>('month')
 const [typeFilter,setTypeFilter] = useState('')
 const [statusFilter,setStatusFilter] = useState('PENDING')
 const [hiddenSellers,setHiddenSellers] = useState<string[]>([])
 const [modal,setModal] = useState<'create'|'detail'|null>(null)
 const [selectedId,setSelectedId] = useState<string|null>(null)
 const [title,setTitle] = useState('')
 const [kind,setKind] = useState('CALL')
 const [assignee,setAssignee] = useState('')
 const [date,setDate] = useState(`${today}T09:00`)
 const [busy,setBusy] = useState(false)
 const [message,setMessage] = useState('')
 const [modalError,setModalError] = useState('')
 const dialog = useRef<HTMLDialogElement>(null)
 const client = useQueryClient()
 const key = ['team-workflow','activities',user?.id]
 const entries = useQuery({queryKey:key,queryFn:async()=>(await api.get('/team-workflow/activities')).data as Activity[],refetchInterval:30000})
 const people = useQuery({queryKey:['workflow-sellers',user?.id],queryFn:async()=>(await api.get('/team-workflow/sellers')).data as Person[]})
 useEffect(()=>{
  const node=dialog.current
  if(modal && node && !node.open) node.showModal()
  if(!modal && node?.open) node.close()
 },[modal])
 const selected = entries.data?.find(e=>e.id===selectedId)
 const visible = (entries.data??[]).filter(e=>!hiddenSellers.includes(e.assignee.id)&&(!typeFilter||e.kind===typeFilter)&&(!statusFilter||e.status===statusFilter))
 const days = view==='month'?monthDays(anchor):weekDays(anchor)
 function create(day:string) {
  setDate(`${day}T09:00`);setTitle('');setAssignee('');setModalError('');setModal('create')
 }
 async function save() {
  setBusy(true);setModalError('')
  try {
   await api.post('/team-workflow/activities',{title:title.trim(),kind,assigneeId:supervisor?assignee:user?.id,startsAt:promotionLocalTimeToIso(date)})
   await client.invalidateQueries({queryKey:key})
   setAnchor(date.slice(0,10));setTypeFilter('');setStatusFilter('PENDING');setHiddenSellers([]);setModal(null);setMessage('Actividad guardada en la agenda.')
  } catch {setModalError('No se pudo guardar la actividad. Revisa los datos o vuelve a intentarlo.')}
  finally {setBusy(false)}
 }
 async function complete(activity:Activity|undefined=selected) {
  if(!activity)return
  setBusy(true);setModalError('')
  try {
   await api.patch(`/team-workflow/activities/${activity.id}/complete`)
   await client.invalidateQueries({queryKey:key});setModal(null);setMessage('Actividad completada.')
  } catch {const error='No se pudo completar. Actualiza la agenda y vuelve a intentarlo.';setModalError(error);setMessage(error)}
  finally {setBusy(false)}
 }
 const groups = [
  {id:'overdue',label:'Atrasadas',description:'Pendientes de días anteriores',color:'text-red-700'},
  {id:'today',label:'Hoy',description:'Actividades programadas para hoy',color:'text-[var(--color-primary)]'},
  {id:'upcoming',label:'Próximas',description:'Llamadas y visitas de los próximos días',color:'text-blue-800'},
  {id:'completed',label:'Completadas',description:'Actividades terminadas',color:'text-emerald-800'},
 ] as const
 const count = visible.filter(e=>days.includes(colombiaDay(e.startsAt))).length
 return <div className="space-y-4">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-condensed text-3xl font-semibold">{supervisor?'Agenda del equipo':'Mi agenda'}</h1><p className="mt-1 text-sm text-neutral-500">Llamadas, visitas y seguimientos · hora de Colombia</p></div><button disabled={entries.isFetching} className={buttonStyle} onClick={()=>void entries.refetch()}>Actualizar agenda</button></header>
  <nav aria-label="Vista de agenda" className="flex gap-2"><button aria-pressed={mode==='calendar'} className={`${buttonStyle} ${mode==='calendar'?'border-red-600 bg-red-50 text-red-700':''}`} onClick={()=>setMode('calendar')}>Calendario</button><button aria-pressed={mode==='tasks'} className={`${buttonStyle} ${mode==='tasks'?'border-red-600 bg-red-50 text-red-700':''}`} onClick={()=>{setMode('tasks');setStatusFilter('')}}>Tareas</button></nav>
  {message&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">{message}</p>}
  {(entries.isError||people.isError)&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm">No se pudo cargar la agenda. <button className="underline" onClick={()=>{void entries.refetch();void people.refetch()}}>Reintentar</button></p>}
  <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
   <aside className="space-y-5 rounded-xl border border-neutral-200 bg-white p-4">
    <button disabled={entries.isPending||entries.isError||people.isError} className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>create(anchor)}>＋ Crear actividad</button>
    {mode==='calendar'&&<section aria-label="Calendario pequeño"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold capitalize">{dayLabel(anchor,{month:'long',year:'numeric'})}</h2><div className="flex gap-1"><button aria-label="Mes anterior del calendario pequeño" onClick={()=>setAnchor(moveMonth(anchor,-1))}>‹</button><button aria-label="Mes siguiente del calendario pequeño" onClick={()=>setAnchor(moveMonth(anchor,1))}>›</button></div></div><div className="grid grid-cols-7 text-center text-xs">{weekdays.map(d=><span key={d} className="py-1 text-neutral-400">{d.charAt(0)}</span>)}{monthDays(anchor).map(d=><button key={d} aria-label={`Ir al ${dayLabel(d,{day:'numeric',month:'long',year:'numeric'})}`} aria-pressed={d===anchor} className={`rounded-full py-1.5 ${d===anchor?'bg-[var(--color-primary)] text-white':d.slice(0,7)!==anchor.slice(0,7)?'text-neutral-300':'hover:bg-neutral-100'}`} onClick={()=>setAnchor(d)}>{Number(d.slice(-2))}</button>)}</div></section>}
    <label className="block text-sm font-semibold">Tipo de actividad<select className={inputStyle} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">Todas</option>{Object.entries(types).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label className="block text-sm font-semibold">Estado<select className={inputStyle} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Todos</option><option value="PENDING">Pendientes</option><option value="COMPLETED">Completadas</option></select></label>
    {supervisor&&<fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Mis vendedores</legend>{people.data?.map(p=><label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!hiddenSellers.includes(p.id)} onChange={e=>setHiddenSellers(prev=>e.target.checked?prev.filter(id=>id!==p.id):[...prev,p.id])}/>{p.name}</label>)}{!people.isPending&&!people.data?.length&&<p className="text-xs text-neutral-500">Sin vendedores asignados.</p>}</fieldset>}
    {mode==='tasks'&&<p className="text-sm font-semibold">{visible.length} tareas con los filtros actuales</p>}
    <p className="text-xs leading-relaxed text-neutral-500">{mode==='calendar'?'Pulsa un día para crear una actividad. Pulsa una actividad para ver sus detalles.':'Las tareas y el calendario comparten las mismas actividades. Completa una tarea o abre sus detalles.'}</p>
   </aside>
   {mode==='calendar'?<section aria-label="Calendario principal" className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div className="flex items-center gap-2"><button className={buttonStyle} onClick={()=>setAnchor(today)}>Hoy</button><button aria-label="Periodo anterior" className={buttonStyle} onClick={()=>setAnchor(view==='month'?moveMonth(anchor,-1):addDays(anchor,-7))}>‹</button><button aria-label="Periodo siguiente" className={buttonStyle} onClick={()=>setAnchor(view==='month'?moveMonth(anchor,1):addDays(anchor,7))}>›</button><h2 className="ml-2 font-condensed text-xl font-semibold capitalize">{dayLabel(anchor,{month:'long',year:'numeric'})}</h2></div><label className="text-sm">Vista <select className="ml-2 rounded-lg border p-2" value={view} onChange={e=>setView(e.target.value as 'month'|'week')}><option value="month">Mes</option><option value="week">Semana</option></select></label></div>
    <div className="border-b px-4 py-2 text-xs text-neutral-500" aria-live="polite">{entries.isPending?'Cargando actividades…':`${count} actividades en este periodo`}{view==='week'&&` · ${dayLabel(days[0]!,{day:'numeric',month:'short'})} — ${dayLabel(days[6]!,{day:'numeric',month:'short'})}`}</div>
    <div className="overflow-x-auto"><div className="min-w-[650px]"><div className="grid grid-cols-7 border-b bg-neutral-50">{weekdays.map(d=><span key={d} className="py-2 text-center text-xs font-semibold uppercase text-neutral-500">{d}</span>)}</div><div className="grid grid-cols-7">{days.map(d=>{
     const scheduled=visible.filter(e=>colombiaDay(e.startsAt)===d).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
     return <div key={d} className={`min-w-0 border-b border-r p-1.5 ${view==='month'?'min-h-28':'min-h-[480px]'} ${view==='month'&&d.slice(0,7)!==anchor.slice(0,7)?'bg-neutral-50':'bg-white'}`}><button aria-label={`Crear actividad el ${dayLabel(d,{day:'numeric',month:'long',year:'numeric'})}`} disabled={entries.isPending||entries.isError||people.isError} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${d===today?'bg-[var(--color-primary)] text-white':'hover:bg-red-50'}`} onClick={()=>create(d)}>{Number(d.slice(-2))}</button><div className="space-y-1">{scheduled.map(e=><button key={e.id} title={e.title} className={`block w-full rounded border px-1.5 py-1 text-left text-xs ${colors[e.kind]??colors.CALL} ${e.status==='COMPLETED'?'opacity-60':''}`} onClick={()=>{setSelectedId(e.id);setModalError('');setModal('detail')}}><span className="block font-semibold">{new Date(e.startsAt).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}{e.status==='COMPLETED'?' ✓':''}</span><span className="block truncate">{e.title}</span>{supervisor&&<span className="block truncate text-[10px] opacity-70">{e.assignee.name}</span>}</button>)}</div></div>
    })}</div></div></div>
   </section>:<section aria-label="Tablero de tareas" className="min-w-0"><h2 className="mb-3 font-condensed text-xl font-semibold">{supervisor?'Tareas del equipo':'Mis tareas'}</h2>{entries.isPending?<p>Cargando tareas…</p>:<div className="grid items-start gap-4 md:grid-cols-2">{groups.map(group=>{
    const items=visible.filter(e=>taskGroup(e,today)===group.id).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
    return <section key={group.id} aria-label={group.label} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className={`font-semibold ${group.color}`}>{group.label}</h3><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{items.length}</span></div><p className="mt-1 text-xs text-neutral-500">{group.description}</p>{!items.length?<p className="mt-4 text-sm text-neutral-400">Sin tareas en este grupo.</p>:<ul className="mt-3 divide-y divide-neutral-100">{items.map(activity=><li key={activity.id} className="flex items-start gap-3 py-3"><button disabled={busy||activity.status==='COMPLETED'} aria-label={activity.status==='COMPLETED'?`Completada: ${activity.title}`:`Completar tarea: ${activity.title}`} className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${activity.status==='COMPLETED'?'border-emerald-600 bg-emerald-600 text-white':'border-neutral-400 hover:border-red-600'}`} onClick={()=>void complete(activity)}>{activity.status==='COMPLETED'?'✓':''}</button><div className="min-w-0 flex-1"><button className={`text-left text-sm font-semibold hover:text-red-700 ${activity.status==='COMPLETED'?'text-neutral-500':''}`} onClick={()=>{setSelectedId(activity.id);setModalError('');setModal('detail')}}>{activity.title}</button><p className="mt-1 text-xs text-neutral-500">{types[activity.kind as keyof typeof types]} · {promotionDate(activity.startsAt)}</p>{supervisor&&<p className="mt-1 text-xs text-neutral-500">{activity.assignee.name}</p>}<p className="mt-1 text-xs text-neutral-400">{activity.creator.id===activity.assignee.id?'Creada por el vendedor':`Asignada por ${activity.creator.name}`}</p></div></li>)}</ul>}</section>
   })}</div>}</section>}
  </div>
  <dialog ref={dialog} onCancel={()=>setModal(null)} onClose={()=>setModal(null)} aria-labelledby="activity-dialog-title" className="w-[min(520px,calc(100%_-_32px))] max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-200 p-0 shadow-xl backdrop:bg-black/50">
   <div className="p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 id="activity-dialog-title" className="font-condensed text-2xl font-semibold">{modal==='create'?'Crear actividad':'Detalle de actividad'}</h2><button aria-label="Cerrar ventana" className={buttonStyle} onClick={()=>setModal(null)}>×</button></div>
    {modalError&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm">{modalError}</p>}
    {modal==='create'?<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save()}}>{supervisor&&<label className="block text-sm">Vendedor<select required className={inputStyle} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Selecciona un vendedor</option>{people.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<label className="block text-sm">Tipo<select className={inputStyle} value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(types).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="block text-sm">Actividad y lugar o referencia<textarea required maxLength={500} className={`${inputStyle} min-h-24`} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Visita al proyecto Los Robles, confirmar instalación"/></label><label className="block text-sm">Fecha y hora · Colombia<input required type="datetime-local" className={inputStyle} value={date} onChange={e=>setDate(e.target.value)}/></label><div className="flex justify-end gap-2"><button type="button" className={buttonStyle} onClick={()=>setModal(null)}>Cancelar</button><button disabled={busy} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">{busy?'Guardando…':'Guardar actividad'}</button></div></form>:selected?<div className="space-y-4"><h3 className="text-lg font-semibold">{selected.title}</h3><p className="text-sm">{types[selected.kind as keyof typeof types]} · {selected.status==='COMPLETED'?'Completada':'Pendiente'}</p><p className="text-sm">{promotionDate(selected.startsAt)} · Colombia</p><p className="text-sm">Vendedor: {selected.assignee.name}</p><p className="text-sm text-neutral-500">{selected.creator.id===selected.assignee.id?'Creada por el vendedor':`Asignada por ${selected.creator.name}`}</p>{selected.status==='PENDING'&&<button disabled={busy} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white" onClick={()=>void complete()}>{busy?'Guardando…':'Marcar completada'}</button>}</div>:<p>La actividad ya no está disponible. Actualiza la agenda.</p>}
   </div>
  </dialog>
 </div>
}
