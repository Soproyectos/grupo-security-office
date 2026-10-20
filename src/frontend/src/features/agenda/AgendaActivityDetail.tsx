import { useState } from 'react'
import { promotionDate } from '../promotions/promotions.service'
import { AGENDA_ACTIVITY_KIND_LABELS, type AgendaActivity, type AgendaLinkTarget, type AgendaPerson } from '../../services/agenda.service'
import AgendaLinksSection from './AgendaLinksSection'

/**
 * Cuerpo del detalle de una actividad (BASE-03): «separar creador, asignado y
 * actor del cambio» y «historial no se borra al completar» — el relato queda
 * en la lista `events` que trae la API, no en el estado del registro.
 *
 * Incremento frontend-equipo: el botón «Reasignar» llama a
 * `PATCH /activities/:id/assign` y solo aparece para quien puede equipo con
 * directorio cargado; sin eso no podría funcionar, así que no se muestra
 * (PANELES-Y-PERMISOS:27).
 *
 * Incremento frontend-vinculos: sección «Recursos enlazados» que pinta
 * exactamente lo que el servidor reveló (ver AgendaLinksSection). Añadir o
 * quitar un enlace sólo toca el VÍNCULO, nunca concede acceso al recurso, y
 * las altas sólo se ofrecen con `canManageLinks` (criterio agendaAccess).
 */

const EVENT_LABELS: Record<string, string> = { CREATE: 'Creada', COMPLETE: 'Completada', ASSIGN: 'Reasignada' }

const inputStyle = 'mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm'
const secondaryButton = 'rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50'

function actorName(activity: AgendaActivity, actorId: string): string | null {
  const known = [activity.creator, activity.assignee, activity.updatedBy].find(person => person?.id === actorId)
  return known?.name ?? null
}

export default function AgendaActivityDetail({
  activity,
  busy,
  onComplete,
  canComplete = true,
  canAssign = false,
  people,
  onReassign,
  canManageLinks = false,
  onAddLink,
  onRemoveLink,
  linkError,
}: {
  activity: AgendaActivity
  busy: boolean
  onComplete: () => void
  canComplete?: boolean
  canAssign?: boolean
  people?: AgendaPerson[]
  onReassign?: (person: AgendaPerson) => void
  canManageLinks?: boolean
  onAddLink?: (targetType: AgendaLinkTarget, targetId: string) => void
  onRemoveLink?: (linkId: string) => void
  linkError?: string
}) {
  const [target, setTarget] = useState('')
  const events = activity.events ?? []
  const offerReassign = canAssign && !!people?.length
  function reassign() {
    const person = people?.find(candidate => candidate.id === target)
    if (person) onReassign?.(person)
  }
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{activity.title}</h3>
      <p className="text-sm">
        {AGENDA_ACTIVITY_KIND_LABELS[activity.kind] ?? activity.kind} ·{' '}
        {activity.status === 'COMPLETED' ? 'Completada' : 'Pendiente'}
      </p>
      <p className="text-sm">{promotionDate(activity.startsAt)} · Colombia</p>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-semibold">Creada por:</span> {activity.creator.name}
        </p>
        <p>
          <span className="font-semibold">Asignada a:</span> {activity.assignee.name}
        </p>
        <p className="text-neutral-500">
          <span className="font-semibold">Último cambio por:</span>{' '}
          {activity.updatedBy?.name ?? 'Sin cambios registrados'}
        </p>
      </div>
      {events.length > 0 && (
        <section aria-label="Historial de la actividad" className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <h4 className="mb-2 text-sm font-semibold">Historial</h4>
          <ul className="space-y-1 text-xs text-neutral-600">
            {events.map(event => {
              const actor = actorName(activity, event.actorId)
              return (
                <li key={event.id}>
                  {EVENT_LABELS[event.type] ?? event.type} el {promotionDate(event.at)}
                  {actor ? ` · ${actor}` : ''}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <AgendaLinksSection
        links={activity.links}
        canManage={canManageLinks}
        busy={busy}
        error={linkError}
        onAdd={(targetType, targetId) => onAddLink?.(targetType, targetId)}
        onRemove={linkId => onRemoveLink?.(linkId)}
      />
      {activity.status === 'PENDING' && canComplete && (
        <button
          disabled={busy}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
          onClick={onComplete}
        >
          {busy ? 'Guardando…' : 'Marcar completada'}
        </button>
      )}
      {offerReassign && (
        <section aria-label="Reasignar actividad" className="space-y-2 rounded-lg border border-neutral-200 p-3">
          <h4 className="text-sm font-semibold">Reasignar</h4>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1 text-sm">
              Vendedor
              <select className={inputStyle} value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Selecciona un vendedor</option>
                {people?.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={busy || !target} className={secondaryButton} onClick={reassign}>
              {busy ? 'Guardando…' : 'Reasignar'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
