import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import { useOwnUserAccess } from '../users/access'
import { promotionDate, promotionLocalTimeToIso } from '../promotions/promotions.service'
import { addDays, colombiaDay, monthDays, moveMonth, taskGroup, weekDays } from '../supervisor/calendar-dates'
import {
  AGENDA_ACTIVITY_KIND_LABELS,
  AgendaServiceError,
  agendaActivitiesKey,
  agendaErrorMessage,
  addAgendaLinkInCache,
  completeAgendaActivityInCache,
  createAgendaActivity,
  dedupeAgendaActivities,
  fetchAgendaActivitiesPage,
  isAgendaActivityCompletedError,
  isAgendaConflict,
  mergeAgendaActivities,
  reassignAgendaActivityInCache,
  removeAgendaLinkInCache,
  type AgendaActivity,
  type AgendaLinkTarget,
  type AgendaPerson,
} from '../../services/agenda.service'
import { agendaAccess, canManageAgendaLinks, isDirectoryForbidden, teamSellersQueryOptions } from './agenda-access'
import { AgendaEmptyState, AgendaTruncatedNotice } from './AgendaNotices'
import AgendaActivityDetail from './AgendaActivityDetail'
import AgendaAssigneeField from './AgendaAssigneeField'
import AgendaWeekView from './AgendaWeekView'
import './agenda-workspace.css'

const types = AGENDA_ACTIVITY_KIND_LABELS
const colors:Record<string,string> = {CALL:'agenda-event-call', VISIT:'agenda-event-visit', FOLLOW_UP:'agenda-event-follow-up'}
const weekdays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const inputStyle = 'mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm'
const buttonStyle = 'rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600'
function dayLabel(day:string, options:Intl.DateTimeFormatOptions) {
 return new Intl.DateTimeFormat('es-CO',{...options,timeZone:'America/Bogota'}).format(new Date(`${day}T12:00:00Z`))
}
export default function AgendaCalendarPage({ initialScope = 'own' }: { initialScope?: 'own' | 'team' } = {}) {
 const user = useAuthStore(s=>s.user)
 const { access: userAccess, status: accessStatus } = useOwnUserAccess()
  // Single source of truth for what the screen offers (agenda-access.ts); the
  // server checks every request again.
  const access = agendaAccess({ roles: user?.roles, grants: userAccess?.grants, status: accessStatus })
  const canCreateOwn = Boolean(access.canCreateOwn)
  const canCompleteOwn = Boolean(access.canCompleteOwn)
  const canCompleteTeam = Boolean(access.canCompleteTeam)
  const canCompleteActivity = (activity: AgendaActivity) => activity.assigneeId === user?.id ? canCompleteOwn : canCompleteTeam
 const today = colombiaDay()
 const [anchor,setAnchor] = useState(today)
 const [mode,setMode] = useState<'calendar'|'tasks'>('calendar')
 const [view,setView] = useState<'month'|'week'>('month')
 const [typeFilter,setTypeFilter] = useState('')
 const [statusFilter,setStatusFilter] = useState('PENDING')
 const [hiddenSellers,setHiddenSellers] = useState<string[]>([])
 const [filtersInitiallyOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches)
 // Alcance local de la misma página: «Mi agenda» (propias) es la vista por
 // defecto para cualquier usuario; «Agenda del equipo» solo se ofrece a quien
 // pasa el criterio `access.canUseTeam` (los datos siguen viniendo del mismo
 // endpoint, sin datos nuevos ni panel duplicado).
 const [scope,setScope] = useState<'own'|'team'>(initialScope)
 const [truncation,setTruncation] = useState<{truncated:boolean;limit:number|null}>({truncated:false,limit:null})
 const [modal,setModal] = useState<'create'|'detail'|null>(null)
 const [selectedId,setSelectedId] = useState<string|null>(null)
 const [title,setTitle] = useState('')
 const [kind,setKind] = useState('CALL')
 const [assignee,setAssignee] = useState('')
 const [date,setDate] = useState(`${today}T09:00`)
 const [busy,setBusy] = useState(false)
 const [message,setMessage] = useState('')
 const [modalError,setModalError] = useState('')
 // Aviso propio de la sección de vínculos (400/404/409 de /links): vive
 // separado de modalError para no mezclarlo con crear/completar/reasignar.
 const [linkError,setLinkError] = useState('')
 const dialog = useRef<HTMLDialogElement>(null)
 const client = useQueryClient()
 const key = agendaActivitiesKey(user?.id)
 // The cache keeps the plain array (shared with the in-cache helpers); the cap
 // notice from the response headers is kept beside it.
 const entries = useQuery({queryKey:key,queryFn:async()=>{const page=await fetchAgendaActivitiesPage();setTruncation({truncated:page.truncated,limit:page.limit});return page.rows},select:dedupeAgendaActivities,refetchInterval:30000})
 // Misma clave para ambas vistas: la caché es única y la vista de equipo solo
 // consulta el directorio si `access.canUseTeam` habilita la query.
 const people = useQuery(teamSellersQueryOptions(user?.id, access))
 const teamView = access.canUseTeam && scope==='team'
 // 403 from the directory means «no team», not a load failure; a network or
 // server failure still shows the retry banner.
 const directoryFailed = people.isError && !isDirectoryForbidden(people.error)
 const noTeam = people.isError ? isDirectoryForbidden(people.error) : (!people.isPending && (people.data ?? []).every(p=>p.id===user?.id))
 useEffect(()=>{
  const node=dialog.current
  if(modal && node && !node.open) node.showModal()
  if(!modal && node?.open) node.close()
 },[modal])
 const selected = entries.data?.find(e=>e.id===selectedId)
 const inScope = (entries.data??[]).filter(e=>teamView||e.assigneeId===user?.id)
 const visible = inScope.filter(e=>!hiddenSellers.includes(e.assignee.id)&&(!typeFilter||e.kind===typeFilter)&&(!statusFilter||e.status===statusFilter))
 const monthDates = monthDays(anchor)
 const monthWeekCount = Math.ceil((monthDates.map(day => day.startsWith(anchor.slice(0,7))).lastIndexOf(true) + 1) / 7)
 const days = view==='month'?monthDates.slice(0,monthWeekCount * 7):weekDays(anchor)
 function create(day:string,hour='09:00') {
  setDate(`${day}T${hour}`);setTitle('');setAssignee('');setModalError('');setModal('create')
 }
 async function save() {
  setBusy(true);setModalError('')
  try {
   const creada = await createAgendaActivity({title:title.trim(),kind,assigneeId:access.canAssignOthers?assignee:(user?.id??''),startsAt:promotionLocalTimeToIso(date)})
   client.setQueryData<AgendaActivity[]>(key,(prev)=>mergeAgendaActivities(prev,[creada]))
   await client.invalidateQueries({queryKey:key})
   setAnchor(date.slice(0,10));setTypeFilter('');setStatusFilter('PENDING');setHiddenSellers([]);setModal(null)
   // Creada para otra persona: en «Mi agenda» no le corresponde aparecer.
   if(!teamView&&access.canUseTeam&&creada.assigneeId!==user?.id) setScope('team')
   setMessage('Actividad guardada en la agenda.')
  } catch (error) {setModalError(agendaErrorMessage(error,'No se pudo guardar la actividad. Revisa los datos o vuelve a intentarlo.'))}
  finally {setBusy(false)}
 }
 async function complete(activity:AgendaActivity|undefined=selected) {
  if(!activity)return
  setBusy(true);setModalError('')
  try {
   await completeAgendaActivityInCache(client,key,activity.id)
   setModal(null);setMessage('Actividad completada.')
  } catch (error) {
   const aviso = agendaErrorMessage(error,'No se pudo completar. Actualiza la agenda y vuelve a intentarlo.')
   setMessage(aviso)
   if(isAgendaConflict(error)||(error instanceof AgendaServiceError&&error.code==='not-found')){
    // 409 «ya completada» (y 404): aviso + recarga. La caché NO se tocó en el
    // intento y la recarga pasa por el dedup por id del select, así que la
    // fila no se duplica ni queda en un estado que el servidor no confirmó.
    setModal(null)
    await client.invalidateQueries({queryKey:key})
   } else setModalError(aviso)
  }
  finally {setBusy(false)}
 }
 // «Reasignar»: PATCH /activities/:id/assign. Solo entra desde el detalle en
 // vista de equipo (canAssign), y la caché solo cambia si la API responde —
 // un 403/404 se queda en el aviso del diálogo, sin movimiento optimista.
 async function reassign(activity:AgendaActivity|undefined,person:AgendaPerson) {
  if(!activity)return
  setBusy(true);setModalError('')
  try {
   await reassignAgendaActivityInCache(client,key,activity.id,person)
   setMessage(`Actividad reasignada a ${person.name}.`)
  } catch (error) {
   setModalError(agendaErrorMessage(error,'No se pudo reasignar. Vuelve a intentarlo.'))
   if(isAgendaActivityCompletedError(error)) await client.invalidateQueries({queryKey:key})
  }
  finally {setBusy(false)}
 }
 // «Añadir enlace»: POST /activities/:id/links con SOLO targetType+targetId
 // (nada que conceda permisos). El POST responde siempre revealed:false por
 // diseño, así que el estado real llega con el refetch que invalida la caché.
 async function addLink(activity:AgendaActivity|undefined,targetType:AgendaLinkTarget,targetId:string) {
  if(!activity)return
  setBusy(true);setLinkError('')
  try {
   await addAgendaLinkInCache(client,key,activity.id,{targetType,targetId})
   setMessage('Enlace añadido. Su detalle aparece solo si tienes acceso vigente al recurso.')
  } catch (error) {
   setLinkError(agendaErrorMessage(error,'No se pudo añadir el enlace. Vuelve a intentarlo.'))
   // Completed meanwhile: reload so the detail shows it locked.
   if(isAgendaActivityCompletedError(error)) await client.invalidateQueries({queryKey:key})
  }
  finally {setBusy(false)}
 }
 // «Quitar enlace»: DELETE del vínculo, no de la actividad (la trazabilidad
 // de la tarea se conserva; sólo desaparece la referencia al recurso).
 async function removeLink(activity:AgendaActivity|undefined,linkId:string) {
  if(!activity)return
  setBusy(true);setLinkError('')
  try {
   await removeAgendaLinkInCache(client,key,activity.id,linkId)
   setMessage('Enlace quitado de la actividad.')
  } catch (error) {
   setLinkError(agendaErrorMessage(error,'No se pudo quitar el enlace. Vuelve a intentarlo.'))
   if(isAgendaActivityCompletedError(error)) await client.invalidateQueries({queryKey:key})
  }
  finally {setBusy(false)}
 }
 const groups = [
  {id:'overdue',label:'Atrasadas',description:'Pendientes de días anteriores',color:'text-red-700'},
  {id:'today',label:'Hoy',description:'Actividades programadas para hoy',color:'text-[var(--color-primary)]'},
  {id:'upcoming',label:'Próximas',description:'Llamadas y visitas de los próximos días',color:'text-neutral-700'},
  {id:'completed',label:'Completadas',description:'Actividades terminadas',color:'text-emerald-800'},
 ] as const
 const count = visible.filter(e=>days.includes(colombiaDay(e.startsAt))).length
 return <div className="agenda-workspace">
  <header className="agenda-toolbar"><h1 className="sr-only">{teamView?'Agenda del equipo':'Mi agenda'}</h1><div className="agenda-toolbar-actions">{access.canUseTeam&&<div role="group" aria-label="Alcance de la agenda" className="agenda-toggle"><button aria-pressed={!teamView} className={`${buttonStyle} ${!teamView?'border-red-600 bg-red-50 text-red-700':''}`} onClick={()=>setScope('own')}>Mi agenda</button><button aria-pressed={teamView} className={`${buttonStyle} ${teamView?'border-red-600 bg-red-50 text-red-700':''}`} onClick={()=>setScope('team')}>Agenda del equipo</button></div>}<nav aria-label="Vista de agenda" className="agenda-toggle"><button aria-pressed={mode==='calendar'} className={`${buttonStyle} ${mode==='calendar'?'border-red-600 bg-red-50 text-red-700':''}`} onClick={()=>setMode('calendar')}>Calendario</button><button aria-pressed={mode==='tasks'} className={`${buttonStyle} ${mode==='tasks'?'border-red-600 bg-red-50 text-red-700':''}`} onClick={()=>{setMode('tasks');setStatusFilter('')}}>Tareas</button></nav><button disabled={entries.isFetching} className={buttonStyle} onClick={()=>void entries.refetch()}>Actualizar</button>{(canCreateOwn||access.canAssignOthers)&&<button disabled={entries.isPending||entries.isError||directoryFailed} className="agenda-create-button" onClick={()=>create(anchor)}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg>Crear actividad</button>}</div></header>
  {message&&<p role="status" className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-sm">{message}</p>}
  {(entries.isError||directoryFailed)&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm">No se pudo cargar la agenda. <button className="underline" onClick={()=>{void entries.refetch();if(directoryFailed)void people.refetch()}}>Reintentar</button></p>}
  {truncation.truncated&&<AgendaTruncatedNotice limit={truncation.limit}/>}
  <div className={`agenda-layout ${mode==='tasks'?'agenda-layout-tasks':''}`}>
   <aside className="agenda-sidebar">
    {mode==='calendar'&&<details className="agenda-mini-calendar" open><summary className="agenda-mini-summary">Calendario pequeño</summary><section aria-label="Calendario pequeño"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold capitalize">{dayLabel(anchor,{month:'long',year:'numeric'})}</h2><div className="flex gap-1"><button aria-label="Mes anterior del calendario pequeño" onClick={()=>setAnchor(moveMonth(anchor,-1))}>‹</button><button aria-label="Mes siguiente del calendario pequeño" onClick={()=>setAnchor(moveMonth(anchor,1))}>›</button></div></div><div className="grid grid-cols-7 text-center text-xs">{weekdays.map(d=><span key={d} className="py-1 text-neutral-400">{d.charAt(0)}</span>)}{monthDays(anchor).map(d=><button key={d} aria-label={`Ir al ${dayLabel(d,{day:'numeric',month:'long',year:'numeric'})}`} aria-pressed={d===anchor} className={`rounded-full py-1 ${d===anchor?'bg-[var(--color-primary)] text-white':d.slice(0,7)!==anchor.slice(0,7)?'text-neutral-300':'hover:bg-neutral-100'}`} onClick={()=>setAnchor(d)}>{Number(d.slice(-2))}</button>)}</div></section></details>}
    <details className="agenda-filter-details" open={filtersInitiallyOpen}><summary>Filtros</summary><div className="agenda-filter-fields"><label className="block text-sm font-semibold">Tipo de actividad<select className={inputStyle} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">Todas</option>{Object.entries(types).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label className="block text-sm font-semibold">Estado<select className={inputStyle} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Todos</option><option value="PENDING">Pendientes</option><option value="COMPLETED">Completadas</option></select></label>
    {teamView&&<fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Personas del equipo</legend>{people.data?.map(p=><label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!hiddenSellers.includes(p.id)} onChange={e=>setHiddenSellers(prev=>e.target.checked?prev.filter(id=>id!==p.id):[...prev,p.id])}/>{p.name}</label>)}{!people.isPending&&!people.data?.length&&<p className="text-xs text-neutral-500">Tu equipo todavía no tiene personas.</p>}</fieldset>}
    </div></details>{(typeFilter||statusFilter!=='PENDING'||hiddenSellers.length>0)&&<button className="agenda-clear-filters" onClick={()=>{setTypeFilter('');setStatusFilter('PENDING');setHiddenSellers([])}}>Limpiar filtros</button>}
    {mode==='tasks'&&<p className="text-sm font-semibold">{visible.length} tareas con los filtros actuales</p>}
    {!entries.isPending&&!entries.isError&&visible.length===0&&<div className="agenda-empty-note"><AgendaEmptyState teamView={teamView} noTeam={noTeam} hasRowsInScope={inScope.length>0} canCreate={canCreateOwn}/></div>}
    <p className="text-xs leading-relaxed text-neutral-500">{mode==='calendar'?((canCreateOwn||access.canAssignOthers)?'Pulsa un día para crear una actividad. Pulsa una actividad para ver sus detalles.':'Pulsa una actividad para ver sus detalles.'):'Las tareas y el calendario comparten las mismas actividades. Completa una tarea o abre sus detalles.'}</p>
   </aside>
    {mode==='calendar'?<section aria-label="Calendario principal" className={`agenda-calendar-panel agenda-calendar-panel-${view} min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white`}>
     <div className="agenda-calendar-toolbar"><div className="agenda-calendar-nav"><button className={buttonStyle} onClick={()=>setAnchor(today)}>Hoy</button><button aria-label="Periodo anterior" className={buttonStyle} onClick={()=>setAnchor(view==='month'?moveMonth(anchor,-1):addDays(anchor,-7))}>‹</button><button aria-label="Periodo siguiente" className={buttonStyle} onClick={()=>setAnchor(view==='month'?moveMonth(anchor,1):addDays(anchor,7))}>›</button></div><h2 className="font-condensed text-xl font-semibold capitalize">{view==='week'?`${dayLabel(days[0]!,{day:'numeric',month:'short'})} – ${dayLabel(days[6]!,{day:'numeric',month:'short',year:'numeric'})}`:dayLabel(anchor,{month:'long',year:'numeric'})}</h2><div className="agenda-view-switch" role="group" aria-label="Vista del calendario">{(['month','week'] as const).map(item=><button key={item} aria-pressed={view===item} className={view===item?'is-active':''} onClick={()=>setView(item)}>{item==='month'?'Mes':'Semana'}</button>)}</div></div>
     <div className="agenda-calendar-count" aria-live="polite">{entries.isPending?'Cargando actividades…':`${count} actividades en este periodo`}</div>
     {view==='month'?<div className="agenda-month-view"><div className="agenda-weekday-row">{weekdays.map(d=><span key={d}>{d}</span>)}</div><div className="agenda-month-grid" style={{gridTemplateRows:`repeat(${monthWeekCount},minmax(0,1fr))`}}>{days.map(d=>{
     const scheduled=visible.filter(e=>colombiaDay(e.startsAt)===d).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
      return <div key={d} className={`agenda-day-cell min-w-0 border-b border-r p-1 ${view==='month'?'min-h-20':'min-h-[260px]'} ${view==='month'&&d.slice(0,7)!==anchor.slice(0,7)?'bg-neutral-50':'bg-white'}`}>{(canCreateOwn||access.canAssignOthers)?<button aria-label={`Crear actividad el ${dayLabel(d,{day:'numeric',month:'long',year:'numeric'})}`} disabled={entries.isPending||entries.isError||directoryFailed} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${d===today?'bg-[var(--color-primary)] text-white':'hover:bg-red-50'}`} onClick={()=>create(d)}>{Number(d.slice(-2))}</button>:<span aria-label={dayLabel(d,{day:'numeric',month:'long',year:'numeric'})} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${d===today?'bg-neutral-200':''}`}>{Number(d.slice(-2))}</span>}<div className="space-y-1">{scheduled.map(e=><button key={e.id} title={e.title} className={`block w-full rounded border px-1.5 py-1 text-left text-xs ${colors[e.kind]??colors.CALL} ${e.status==='COMPLETED'?'opacity-60':''}`} onClick={()=>{setSelectedId(e.id);setModalError('');setLinkError('');setModal('detail')}}><span className="block font-semibold">{new Date(e.startsAt).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}{e.status==='COMPLETED'?' ✓':''}</span><span className="block truncate">{e.title}</span>{teamView&&<span className="block truncate text-[10px] opacity-70">{e.assignee.name}</span>}</button>)}</div></div>
     })}</div></div>:<AgendaWeekView days={days} activities={visible} today={today} teamView={teamView} canCreate={canCreateOwn||access.canAssignOthers} disabled={entries.isPending||entries.isError||directoryFailed} onCreate={create} onSelect={activity=>{setSelectedId(activity.id);setModalError('');setLinkError('');setModal('detail')}}/>}
   </section>:<section aria-label="Tablero de tareas" className="min-w-0"><h2 className="mb-3 font-condensed text-xl font-semibold">{teamView?'Tareas del equipo':'Mis tareas'}</h2>{entries.isPending?<p>Cargando tareas…</p>:<div className="grid items-start gap-4 md:grid-cols-2">{groups.map(group=>{
    const items=visible.filter(e=>taskGroup(e,today)===group.id).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
    return <section key={group.id} aria-label={group.label} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className={`font-semibold ${group.color}`}>{group.label}</h3><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{items.length}</span></div><p className="mt-1 text-xs text-neutral-500">{group.description}</p>{!items.length?<p className="mt-4 text-sm text-neutral-400">Sin tareas en este grupo.</p>:<ul className="mt-3 divide-y divide-neutral-100">{items.map(activity=><li key={activity.id} className="flex items-start gap-3 py-3"><button disabled={busy||activity.status==='COMPLETED'||!canCompleteActivity(activity)} aria-label={activity.status==='COMPLETED'?`Completada: ${activity.title}`:`Completar tarea: ${activity.title}`} className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${activity.status==='COMPLETED'?'border-emerald-600 bg-emerald-600 text-white':'border-neutral-400 hover:border-red-600'}`} onClick={()=>void complete(activity)}>{activity.status==='COMPLETED'?'✓':''}</button><div className="min-w-0 flex-1"><button className={`text-left text-sm font-semibold hover:text-red-700 ${activity.status==='COMPLETED'?'text-neutral-500':''}`} onClick={()=>{setSelectedId(activity.id);setModalError('');setLinkError('');setModal('detail')}}>{activity.title}</button><p className="mt-1 text-xs text-neutral-500">{types[activity.kind]??activity.kind} · {promotionDate(activity.startsAt)}</p>{teamView&&<p className="mt-1 text-xs text-neutral-500">{activity.assignee.name}</p>}<p className="mt-1 text-xs text-neutral-400">{activity.creator.id===activity.assignee.id?'Creada por quien la tiene asignada':`Asignada por ${activity.creator.name}`}</p></div></li>)}</ul>}</section>
   })}</div>}</section>}
  </div>
  <dialog ref={dialog} onCancel={()=>setModal(null)} onClose={()=>setModal(null)} aria-labelledby="activity-dialog-title" className="agenda-dialog w-[min(520px,calc(100%_-_32px))] max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-200 p-0 shadow-xl backdrop:bg-black/50">
   <div className="p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 id="activity-dialog-title" className="font-condensed text-2xl font-semibold">{modal==='create'?'Crear actividad':'Detalle de actividad'}</h2><button aria-label="Cerrar ventana" className={buttonStyle} onClick={()=>setModal(null)}>×</button></div>
    {modalError&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm">{modalError}</p>}
    {modal==='create'?<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save()}}>{access.canUseTeam&&!access.canAssignOthers&&<p className="text-sm text-neutral-600">La actividad se guarda en tu propia agenda.</p>}<AgendaAssigneeField canAssign={access.canAssignOthers} people={people.data} value={assignee} onChange={e=>setAssignee(e.target.value)}/><label className="block text-sm">Tipo<select className={inputStyle} value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(types).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="block text-sm">Actividad y lugar o referencia<textarea required maxLength={500} className={`${inputStyle} min-h-24`} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Visita al proyecto Los Robles, confirmar instalación"/></label><label className="block text-sm">Fecha y hora · Colombia<input required type="datetime-local" className={inputStyle} value={date} onChange={e=>setDate(e.target.value)}/></label><div className="flex justify-end gap-2"><button type="button" className={buttonStyle} onClick={()=>setModal(null)}>Cancelar</button><button disabled={busy} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">{busy?'Guardando…':'Guardar actividad'}</button></div></form>    :selected?<AgendaActivityDetail activity={selected} busy={busy} onComplete={()=>void complete()} canComplete={canCompleteActivity(selected)} canAssign={teamView&&access.canAssignOthers} people={people.data} onReassign={person=>void reassign(selected,person)} canManageLinks={selected.status!=='COMPLETED'&&canManageAgendaLinks(access,selected,user?.id)} onAddLink={(targetType,targetId)=>void addLink(selected,targetType,targetId)} onRemoveLink={linkId=>void removeLink(selected,linkId)} linkError={linkError}/>:<p>La actividad ya no está disponible. Actualiza la agenda.</p>}
   </div>
  </dialog>
 </div>
}
