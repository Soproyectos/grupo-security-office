import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createZone, deleteZone, fetchMunicipalities, fetchZones, municipalityLabel, updateZone, type Zone, type ZoneCity } from '../../../services/zones.service'

const BUTTON = 'min-h-11 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY = 'min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50'
const DANGER = 'min-h-11 rounded-lg border border-[var(--color-error)] px-3 py-2 text-sm font-medium text-[var(--color-error-hover)] hover:bg-[var(--color-error-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-error)] disabled:cursor-not-allowed disabled:opacity-50'
const FIELD = 'mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]'
const CARD = 'rounded-xl border border-[var(--color-border)] bg-white p-5'
const MAX_RESULTS = 8

/** Sin tildes y en minúscula, para que «medellin» encuentre «Medellín». */
export const normalizeText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Municipios que coinciden con la búsqueda (por nombre o departamento) y todavía no están elegidos. */
export function searchMunicipalities<T extends { code: string; name: string; department: string }>(all: readonly T[], term: string, chosen: ReadonlySet<string>, limit = MAX_RESULTS): T[] {
  const needle = normalizeText(term.trim())
  if (needle.length < 2) return []
  const out: T[] = []
  for (const m of all) {
    if (chosen.has(m.code)) continue
    if (normalizeText(`${m.name} ${m.department}`).includes(needle)) { out.push(m); if (out.length >= limit) break }
  }
  return out
}

function CityPicker({ all, loading, failed, chosen, onChange }: { all: ZoneCity[]; loading: boolean; failed: boolean; chosen: ZoneCity[]; onChange: (next: ZoneCity[]) => void }) {
  const [term, setTerm] = useState('')
  const codes = useMemo(() => new Set(chosen.map(c => c.code)), [chosen])
  const results = useMemo(() => searchMunicipalities(all, term, codes), [all, term, codes])
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor="zona-ciudad">Ciudades de la zona</label>
      <input id="zona-ciudad" type="search" className={FIELD} value={term} onChange={e => setTerm(e.target.value)} placeholder="Escribe el nombre de una ciudad" autoComplete="off" disabled={loading || failed} />
      {loading && <p className="mt-2 text-sm text-[var(--color-text-secondary)]" aria-busy="true">Cargando ciudades…</p>}
      {failed && <p role="alert" className="mt-2 text-sm text-[var(--color-error-hover)]">No se pudo cargar la lista de ciudades. Recarga la página para intentarlo de nuevo.</p>}
      {term.trim().length >= 2 && !results.length && !loading && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">No hay ciudades con esa búsqueda, o ya están en la zona.</p>}
      {!!results.length && (
        <ul className="mt-2 divide-y divide-[var(--color-divider)] rounded-lg border border-[var(--color-border)] bg-white" aria-label="Ciudades encontradas">
          {results.map(m => (
            <li key={m.code}>
              <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]" onClick={() => { onChange([...chosen, m]); setTerm('') }}>
                <span>{municipalityLabel(m)}</span><span className="text-xs font-medium text-[var(--color-primary)]">Agregar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-text-secondary)]">{chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'ciudad elegida' : 'ciudades elegidas'}` : 'Aún no elegiste ninguna ciudad. Busca arriba y agrégalas.'}</p>
        {chosen.length > 1 && <button type="button" className={BUTTON} onClick={() => onChange([])}>Quitar todas</button>}
      </div>
      {!!chosen.length && (
        <ul className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-y-auto" aria-label="Ciudades de la zona">
          {chosen.map(c => (
            <li key={c.code}>
              <button type="button" className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 py-1 text-sm hover:bg-[var(--color-bg-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]" onClick={() => onChange(chosen.filter(x => x.code !== c.code))}>
                {municipalityLabel(c)}<span className="sr-only"> (quitar de la zona)</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Zonas de asesores (solo Super Admin): cada zona agrupa ciudades y reparte los registros nuevos entre sus asesores. */
export default function ZonesAdminSection() {
  const client = useQueryClient()
  const zones = useQuery({ queryKey: ['portal-admin-zones'], queryFn: fetchZones })
  const municipalities = useQuery({ queryKey: ['portal-admin-municipalities'], queryFn: fetchMunicipalities, staleTime: Infinity })
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<ZoneCity[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState(''), [failed, setFailed] = useState(false)

  async function run(fn: () => Promise<unknown>, success: string, failure = 'No se pudo guardar la zona. Revisa los datos e inténtalo de nuevo.') {
    setBusy(true); setMessage(''); setFailed(false)
    try {
      await fn()
      await Promise.all(['portal-admin-zones', 'zones', 'portal-admin-advisors'].map(k => client.invalidateQueries({ queryKey: [k] })))
      setMessage(success)
      return true
    } catch (error) {
      const server = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message
      setMessage(typeof server === 'string' && server ? server : failure); setFailed(true)
      return false
    } finally { setBusy(false) }
  }

  const reset = () => { setEditing(null); setName(''); setChosen([]) }
  const startEdit = (z: Zone) => { setEditing(z.id); setName(z.name); setChosen(z.cities); setConfirmDelete(null); setMessage(''); setFailed(false); requestAnimationFrame(() => { nameRef.current?.scrollIntoView?.({ block: 'center' }); nameRef.current?.focus() }) }
  const canSave = name.trim().length >= 2 && chosen.length > 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    const body = { name: name.trim(), cityCodes: chosen.map(c => c.code) }
    const ok = await run(() => (editing ? updateZone(editing, body) : createZone(body)), editing ? 'Zona actualizada.' : 'Zona creada.')
    if (ok) reset()
  }

  return (
    <section className={CARD} aria-labelledby="zonas">
      <h2 id="zonas" className="text-xl font-semibold">Zonas de asesores</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Una zona junta ciudades. Cuando alguien se registra en la tienda, su cuenta se reparte entre los asesores activos cuya zona incluye su ciudad. Si ninguno la cubre, queda en la cola de supervisores. La zona de cada asesor se elige en Usuarios.</p>

      {message && <p role={failed ? 'alert' : 'status'} className={`mt-3 rounded-lg p-3 text-sm ${failed ? 'bg-[var(--color-error-bg-subtle)] text-[var(--color-error-hover)]' : 'bg-[var(--color-success-bg-subtle)] text-[var(--color-success-hover)]'}`}>{message}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          {zones.isPending ? (
            <div className="space-y-3" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--color-bg-surface-hover)]" />)}</div>
          ) : zones.isError ? (
            <p role="alert" className="text-sm text-[var(--color-error-hover)]">No se pudieron cargar las zonas. <button type="button" className="font-medium underline" onClick={() => void zones.refetch()}>Reintentar</button></p>
          ) : !zones.data?.length ? (
            <p className="text-sm text-[var(--color-text-secondary)]">Todavía no hay zonas. Crea la primera con el formulario: ponle un nombre y elige sus ciudades.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-divider)]">
              {zones.data.map(z => (
                <li key={z.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{z.name}{!z.isActive && <span className="ml-2 rounded-full bg-[var(--color-bg-surface-hover)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">Inactiva</span>}</p>
                      <p className="text-sm text-[var(--color-text-secondary)]">{z.cities.length} {z.cities.length === 1 ? 'ciudad' : 'ciudades'} · {z.usersCount} {z.usersCount === 1 ? 'asesor' : 'asesores'}</p>
                      <p className="text-sm text-[var(--color-text-secondary)]">{z.cities.slice(0, 3).map(municipalityLabel).join(', ')}{z.cities.length > 3 ? ` y ${z.cities.length - 3} más` : ''}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={BUTTON} disabled={busy} onClick={() => startEdit(z)}>Editar<span className="sr-only"> {z.name}</span></button>
                      <button type="button" className={BUTTON} disabled={busy} onClick={() => void run(() => updateZone(z.id, { isActive: !z.isActive }), z.isActive ? 'Zona desactivada: ya no recibe registros nuevos.' : 'Zona activada.')}>{z.isActive ? 'Desactivar' : 'Activar'}<span className="sr-only"> {z.name}</span></button>
                      <button type="button" className={DANGER} disabled={busy} onClick={() => setConfirmDelete(confirmDelete === z.id ? null : z.id)}>Eliminar<span className="sr-only"> {z.name}</span></button>
                    </div>
                  </div>
                  {confirmDelete === z.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--color-bg-surface)] p-3">
                      <p className="text-sm">¿Eliminar la zona «{z.name}»? Esto no se puede deshacer.</p>
                      <button type="button" className={DANGER} disabled={busy} onClick={() => void run(() => deleteZone(z.id), 'Zona eliminada.', 'No se pudo eliminar la zona.').then(ok => { setConfirmDelete(null); if (ok && editing === z.id) reset() })}>Sí, eliminar</button>
                      <button type="button" className={BUTTON} onClick={() => setConfirmDelete(null)}>Cancelar</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form className="space-y-4" onSubmit={e => void save(e)}>
          <h3 className="text-lg font-semibold">{editing ? 'Editar zona' : 'Crear zona'}</h3>
          {editing && <p className="text-sm text-[var(--color-text-secondary)]">Estas son las ciudades actuales de la zona. Quita las que ya no cubra o agrega otras; no hace falta volver a escribirlas.</p>}
          <label className="block text-sm">Nombre de la zona<input ref={nameRef} required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} className={FIELD} placeholder="Ej. Eje Cafetero" /></label>
          <CityPicker all={municipalities.data ?? []} loading={municipalities.isPending} failed={municipalities.isError} chosen={chosen} onChange={setChosen} />
          <div className="flex flex-wrap gap-2">
            <button className={PRIMARY} disabled={busy || !canSave}>{editing ? 'Guardar cambios' : 'Crear zona'}</button>
            {editing && <button type="button" className={BUTTON} onClick={reset}>Cancelar edición</button>}
          </div>
          {!canSave && <p className="text-xs text-[var(--color-text-secondary)]">Para guardar necesitas un nombre y al menos una ciudad.</p>}
        </form>
      </div>
    </section>
  )
}
