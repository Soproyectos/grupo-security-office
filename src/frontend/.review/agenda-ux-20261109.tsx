import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../src/index.css'
import AdminLayout from '../src/components/layout/AdminLayout'
import AgendaCalendarPage from '../src/features/agenda/AgendaCalendarPage'
import { useAuthStore } from '../src/stores/auth.store'
import { userAccessKey } from '../src/features/users/access'
import api from '../src/services/api'
import type { AgendaActivity, AgendaPerson } from '../src/services/agenda.service'

// Fixture aislada: identidad y respuestas ficticias; cualquier endpoint no
// declarado falla en el adapter de Axios y nunca alcanza el backend.
Object.defineProperty(window, 'EventSource', { value: undefined, configurable: true })
useAuthStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } })

const params = new URLSearchParams(window.location.search)
const readOnly = params.get('readonly') === '1'
const role = readOnly ? 'Consulta de demostración' : 'Super Admin'
const user = { id: 'ux-agenda-demo', name: 'Alex Rivera · demostración', email: 'agenda@example.invalid', roles: [role], permissions: [] }
useAuthStore.setState({ isAuthenticated: true, user })
const people: AgendaPerson[] = [
  { id: user.id, name: user.name },
  { id: 'ux-person-ana', name: 'Ana Torres · demostración' },
  { id: 'ux-person-diego', name: 'Diego Rojas · demostración' },
  { id: 'ux-person-luz', name: 'Luz Martínez · demostración' },
]
const fakeLinkId = '11111111-1111-4111-8111-111111111111'
const dayInBogota = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const baseDay = dayInBogota(new Date())
const shiftDay = (amount: number) => {
  const date = new Date(`${baseDay}T12:00:00-05:00`)
  date.setDate(date.getDate() + amount)
  return dayInBogota(date)
}
const at = (offset: number, hour: number) => `${shiftDay(offset)}T${String(hour).padStart(2, '0')}:00:00-05:00`
const titles = params.get('empty') === '1' ? [] : [
  'Confirmar disponibilidad del transformador principal', 'Visita técnica · Proyecto Los Robles',
  'Llamar a compras para validar cantidades', 'Revisar propuesta de instalación',
  'Seguimiento de cotización pendiente', 'Coordinar visita con el equipo de obra',
  'Confirmar acceso a sala eléctrica', 'Llamada de seguimiento comercial',
  'Revisar medidas del tablero', 'Enviar resumen de acuerdos',
  'Validar fecha de entrega', 'Visita de levantamiento técnico',
  'Confirmar recepción de documentos', 'Seguimiento a aprobación de presupuesto',
  'Revisar inventario para despacho', 'Llamar a la persona de contacto',
  'Coordinar pruebas de puesta en marcha', 'Actualizar cronograma del proyecto',
  'Confirmar asistentes a reunión', 'Revisar pendientes del cliente',
]
const kinds = ['CALL', 'VISIT', 'FOLLOW_UP']
let activities: AgendaActivity[] = titles.map((title, index) => {
  const assigned = people[(index % (people.length - 1)) + 1]!
  const owner = readOnly || index % 4 === 0 ? people[0]! : assigned
  const offset = index < 4 ? -index - 1 : index < 10 ? 0 : index - 10
  const activity: AgendaActivity = {
    id: `ux-activity-${index + 1}`, title, kind: kinds[index % kinds.length]!, startsAt: new Date(at(offset, index === 7 ? 23 : 8 + (index % 9))).toISOString(),
    status: index === 3 ? 'COMPLETED' : 'PENDING', assigneeId: owner.id, creatorId: user.id,
    createdAt: at(offset - 2, 9), updatedAt: null, completedAt: index === 3 ? at(offset, 12) : null,
    updatedById: index === 3 ? user.id : null, assignee: owner, creator: people[0]!,
    updatedBy: index === 3 ? people[0]! : null,
    events: [{ id: `ux-event-${index + 1}`, activityId: `ux-activity-${index + 1}`, actorId: user.id, type: 'CREATE', at: at(offset - 2, 9) }],
    links: index === 1 ? [{ id: fakeLinkId, targetType: 'PRODUCT', targetId: fakeLinkId, revealed: true, label: 'Interruptor termomagnético · demostración', target: { id: fakeLinkId, name: 'Interruptor termomagnético · demostración', sku: 'DEMO-INT-042', publishStatus: 'borrador' } }] : [],
  }
  return activity
})
const access = {
  catalogVersion: 'ux-agenda-fixture', accessVersion: 1, sources: [], packages: [],
  grants: readOnly ? [{ sourceId: 'fixture', actionId: 'activities:read', scope: 'own' }] : [],
}
const knownRoute = (url: string) => url.replace(/^.*\/api(?=\/|$)/, '').split('?')[0]

api.defaults.adapter = async config => {
  const method = (config.method ?? 'get').toLowerCase()
  const path = knownRoute(config.url ?? '')
  let data: unknown
  let headers: Record<string, string> = {}
  if (method === 'get' && path === '/auth/profile') data = user
  else if (method === 'get' && path === `/users/${user.id}/access`) data = access
  else if (method === 'get' && path === '/team-workflow/activities') {
    data = structuredClone(activities)
    headers = { 'x-total-truncated': 'false', 'x-activities-limit': '1000' }
  } else if (method === 'get' && path === '/team-workflow/sellers') data = structuredClone(people)
  else if (method === 'post' && path === '/team-workflow/activities') {
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    const assignee = people.find(person => person.id === payload?.assigneeId) ?? people[0]!
    data = { id: `ux-created-${Date.now()}`, title: payload.title, kind: payload.kind, startsAt: payload.startsAt, status: 'PENDING', assigneeId: assignee.id, creatorId: user.id, createdAt: new Date().toISOString(), assignee, creator: people[0]!, events: [], links: [] }
    activities = [data as AgendaActivity, ...activities]
  } else {
    const complete = path.match(/^\/team-workflow\/activities\/([^/]+)\/complete$/)
    const assign = path.match(/^\/team-workflow\/activities\/([^/]+)\/assign$/)
    const linkAdd = path.match(/^\/team-workflow\/activities\/([^/]+)\/links$/)
    const linkRemove = path.match(/^\/team-workflow\/activities\/([^/]+)\/links\/([^/]+)$/)
    const row = activities.find(activity => activity.id === complete?.[1] || activity.id === assign?.[1] || activity.id === linkAdd?.[1] || activity.id === linkRemove?.[1])
    if (method === 'patch' && complete && row) {
      row.status = 'COMPLETED'; row.completedAt = new Date().toISOString(); row.updatedBy = people[0]; row.updatedById = user.id
      row.events = [...(row.events ?? []), { id: `ux-event-${Date.now()}`, activityId: row.id, actorId: user.id, type: 'COMPLETE', at: new Date().toISOString() }]
      data = { ok: true }
    } else if (method === 'patch' && assign && row) {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
      const person = people.find(candidate => candidate.id === payload?.assigneeId)
      if (!person) throw new Error('Fixture: persona no disponible')
      row.assigneeId = person.id; row.assignee = person; data = { ok: true }
    } else if (method === 'post' && linkAdd && row) {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
      row.links = [...(row.links ?? []), { id: `ux-link-${Date.now()}`, targetType: payload.targetType, targetId: payload.targetId, revealed: true, label: 'Recurso de demostración' }]
      data = { id: `ux-link-${Date.now()}`, targetType: payload.targetType, targetId: payload.targetId, revealed: false }
    } else if (method === 'delete' && linkRemove && row) {
      row.links = (row.links ?? []).filter(link => link.id !== linkRemove[2]); data = { ok: true }
    } else throw new Error(`Fixture de Agenda bloqueó una solicitud no prevista: ${method.toUpperCase()} ${path}`)
  }
  return { data: { data }, status: 200, statusText: 'OK', headers, config }
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
client.setQueryData(userAccessKey(user.id), access)
client.setQueryData(['team-workflow', 'activities', user.id], activities)
client.setQueryData(['workflow-sellers', user.id], people)

function Fixture() {
  const [note, setNote] = useState('Datos ficticios · los cambios solo viven en esta pestaña.')
  return <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/agenda']}>
      <Routes><Route element={<AdminLayout />}><Route path="/agenda" element={<>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
          <span>Vista previa aislada · {role} · zona horaria Colombia</span>
          <span>{note}</span>
          <button type="button" className="underline" onClick={() => setNote('Prueba crear, completar, reasignar o añadir/quitar un recurso falso.')}>Ayuda de la demostración</button>
        </div>
        <AgendaCalendarPage />
      </>} /></Route></Routes>
    </MemoryRouter>
  </QueryClientProvider>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
