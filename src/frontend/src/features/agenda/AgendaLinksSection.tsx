import { useState, type FormEvent } from 'react'
import { promotionDate } from '../promotions/promotions.service'
import {
  AGENDA_LINK_TARGETS,
  AGENDA_LINK_TARGET_LABELS,
  isUuid,
  type AgendaActivityLink,
  type AgendaLinkTarget,
} from '../../services/agenda.service'

/**
 * Sección «Recursos enlazados» del detalle de una actividad
 * (BASE-03 frontend-vinculos).
 *
 * REGLA DURA (ficha BASE-03 §1 regla 3 / DISENO-CATALOGO:91): «El enlace no
 * concede acceso al elemento» y «si se retira acceso al recurso enlazado, se
 * ocultan los detalles internos… y se bloquea el enlace».
 *
 *  - `revealed:false` ⇒ SOLO `targetType` + `targetId` (trazabilidad), sin
 *    nombre, sin sku, sin estado y SIN navegación: nada aquí es clicable.
 *  - `revealed:true` ⇒ el detalle que YA mandó el servidor (`label`/`target`).
 *
 * Nada de esto añade permisos: no hay ninguna acción de concesión en el
 * cliente; se pinta exactamente lo que el servidor reveló. Las únicas
 * acciones (añadir/quitar) sólo crean/borran el VÍNCULO y llegan a la API
 * con `targetType` + `targetId`, nunca con datos de acceso.
 */

const inputStyle = 'mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm'
const secondaryButton =
  'rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50'

const targetLabel = (targetType: string) =>
  AGENDA_LINK_TARGET_LABELS[targetType as AgendaLinkTarget] ?? targetType

/** Una fila por `id` de vínculo: el estado nunca pinta el mismo enlace dos veces. */
function uniqueLinks(links: readonly AgendaActivityLink[] | null | undefined): AgendaActivityLink[] {
  if (!Array.isArray(links)) return []
  const seen = new Set<string>()
  const unique: AgendaActivityLink[] = []
  for (const link of links) {
    if (!link || typeof link.id !== 'string' || seen.has(link.id)) continue
    seen.add(link.id)
    unique.push(link)
  }
  return unique
}

/** Detalle vivo que el servidor mandó con `revealed:true` (nada se rellena
 *  en el cliente: sin `target` sólo queda el tipo). */
function revealedText(link: AgendaActivityLink): string {
  const target = link.target
  const parts: string[] = []
  const name = link.label ?? target?.name ?? null
  if (name) parts.push(name)
  if (target?.sku) parts.push(`SKU ${target.sku}`)
  if (target?.code) parts.push(target.code)
  if (typeof target?.isActive === 'boolean') parts.push(target.isActive ? 'Activa' : 'Inactiva')
  if (target?.publishStatus) parts.push(target.publishStatus)
  if (target?.currency) parts.push(target.currency)
  if (target?.createdAt) parts.push(`Importada el ${promotionDate(target.createdAt)}`)
  // `revealed:true` con `label`/`target` nulos (p. ej. recurso ya borrado):
  // se muestra el tipo, nunca un hueco vacío. Tampoco se rellena nada más.
  return parts.join(' · ') || targetLabel(link.targetType)
}

export default function AgendaLinksSection({
  links,
  canManage = false,
  busy = false,
  error,
  onAdd,
  onRemove,
}: {
  links: readonly AgendaActivityLink[] | null | undefined
  canManage?: boolean
  busy?: boolean
  error?: string
  onAdd: (targetType: AgendaLinkTarget, targetId: string) => void
  onRemove: (linkId: string) => void
}) {
  const [targetType, setTargetType] = useState<AgendaLinkTarget>('PRODUCT')
  const [targetId, setTargetId] = useState('')
  const rows = uniqueLinks(links)
  // Validación cliente espejo de `@IsUUID()`: sin UUID válido el alta no sale
  // de aquí (el servicio también la repite antes de llamar a la API).
  const validTargetId = isUuid(targetId)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !validTargetId) return
    onAdd(targetType, targetId.trim())
  }

  return (
    <section aria-label="Vínculos de la actividad" className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <h4 className="text-sm font-semibold">Recursos enlazados</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-500">Sin recursos enlazados.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(link => (
            <li
              key={link.id}
              className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-200 py-2 last:border-b-0"
            >
              {link.revealed === true ? (
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{revealedText(link)}</p>
                  <p className="text-xs text-neutral-500">
                    {targetLabel(link.targetType)} ({link.targetType}) · {link.targetId}
                  </p>
                </div>
              ) : (
                // Bloqueado: sin label, sin target, sin navegación — sólo la
                // trazabilidad (tipo + id) que el servidor sí devuelve.
                <div aria-disabled="true" className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-neutral-500">
                    {targetLabel(link.targetType)} ({link.targetType}) · Sin acceso vigente
                  </p>
                  <p className="break-all font-mono text-xs text-neutral-400">{link.targetId}</p>
                  <p className="text-xs text-neutral-400">
                    Trazabilidad del enlace: el recurso queda oculto mientras no tengas acceso.
                  </p>
                </div>
              )}
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  className={secondaryButton}
                  onClick={() => onRemove(link.id)}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {canManage && (
        <form className="space-y-2 border-t border-neutral-200 pt-3" onSubmit={submit}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-40 flex-1 text-sm">
              Tipo de recurso
              <select
                className={inputStyle}
                value={targetType}
                onChange={event => setTargetType(event.target.value as AgendaLinkTarget)}
              >
                {AGENDA_LINK_TARGETS.map(option => (
                  <option key={option} value={option}>
                    {AGENDA_LINK_TARGET_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-64 flex-1 text-sm">
              Identificador (UUID)
              <input
                className={inputStyle}
                value={targetId}
                onChange={event => setTargetId(event.target.value)}
                placeholder="3f2504e0-4f89-41d3-9a0c-0305e82c3301"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !validTargetId}
              className={secondaryButton}
            >
              Añadir enlace
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
