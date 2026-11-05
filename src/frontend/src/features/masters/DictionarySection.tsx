import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useHasAssignedAction } from '../users/access'
import {
  approveMoldEntry,
  createSpecDefinition,
  fetchMold,
  fetchMoldUsage,
  fetchSpecDefinitionUsage,
  fetchSpecDefinitions,
  fetchSubcategories,
  mastersKeys,
  updateSpecDefinition,
  type MoldEntry,
  type MoldUsage,
  type MoldView,
  type SpecDataType,
  type SpecDefinitionUpdate,
  type SpecDefinitionView,
} from './masters-api'
import { ErrorNotice } from './MasterSection'
import {
  SPEC_TYPE_LABELS,
  TEMPLATE_STATUS_LABELS,
  buildOptionsPayload,
  canShowApproveButton,
  impactLines,
  mapMasterError,
  matchesQuery,
  runWithImpactConfirmation,
  snakeKey,
  usageCountLines,
  type MasterError,
  type OptionRow,
} from './masters-rules'

const BTN = 'inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'
const BTN_PRIMARY = `${BTN} border-[var(--color-primary)] bg-[var(--color-primary)] text-white`
const BTN_PLAIN = `${BTN} border-neutral-300 text-neutral-700`
const INPUT = 'min-h-11 w-full rounded-md border border-neutral-300 px-3 text-sm'

export interface DefinitionForm {
  mode: 'create' | 'edit'
  label: string
  dataType: SpecDataType
  unit: string
  isActive: boolean
  rows: OptionRow[]
  original: OptionRow[]
  newLines: string
}

export const emptyDefinitionForm = (): DefinitionForm => ({ mode: 'create', label: '', dataType: 'TEXT', unit: '', isActive: true, rows: [], original: [], newLines: '' })

export const formFromDefinition = (def: SpecDefinitionView): DefinitionForm => {
  const rows = def.options.map((option) => ({ key: option.key, label: option.label, isActive: option.isActive }))
  return { mode: 'edit', label: def.label, dataType: def.dataType, unit: def.unit ?? '', isActive: def.isActive, rows, original: rows.map((row) => ({ ...row })), newLines: '' }
}

const takesOptions = (type: SpecDataType) => type === 'OPTION' || type === 'MULTI_OPTION'

/** Validation message of a definition form, or null when it can be sent. */
export function validateDefinitionForm(form: DefinitionForm): string | null {
  if (!form.label.trim()) return 'Escribe el nombre del dato.'
  if (form.mode === 'create') {
    if (!snakeKey(form.label)) return 'El nombre debe tener letras o números.'
    if (takesOptions(form.dataType) && buildOptionsPayload(form).length === 0) return 'Agrega al menos una opción.'
  }
  return null
}

/** Update body: only what changed. The key and the type never change. */
export function buildDefinitionUpdate(def: SpecDefinitionView, form: DefinitionForm, confirmImpact: boolean): SpecDefinitionUpdate {
  const body: SpecDefinitionUpdate = {}
  if (form.label.trim() !== def.label) body.label = form.label.trim()
  if (def.dataType === 'NUMBER' && (form.unit.trim() || null) !== def.unit) body.unit = form.unit.trim() || null
  if (form.isActive !== def.isActive) body.isActive = form.isActive
  const options = takesOptions(def.dataType) ? buildOptionsPayload(form) : []
  if (options.length > 0) body.options = options
  if (confirmImpact) body.confirmImpact = true
  return body
}

// ---------------------------------------------------------------- definitions

export interface DefinitionsViewProps {
  rows: SpecDefinitionView[]
  loading: boolean
  query: string
  onQuery: (value: string) => void
  canWrite: boolean
  selectedKey: string | null
  onSelect: (key: string | null) => void
  usage: { counts: Record<string, number> } | null
  usageLoading: boolean
  form: DefinitionForm | null
  onForm: (form: DefinitionForm) => void
  onSubmit: () => void
  onCancel: () => void
  onNew: () => void
  onEdit: () => void
  onToggleActive: () => void
  busy: boolean
  error: MasterError | null
  formError: string | null
  impact: { error: MasterError; lines: string[] } | null
  onConfirmImpact: () => void
  onCancelImpact: () => void
}

function DefinitionFormView({ props, form }: { props: DefinitionsViewProps; form: DefinitionForm }) {
  const set = (patch: Partial<DefinitionForm>) => props.onForm({ ...form, ...patch })
  return (
    <form aria-label={form.mode === 'create' ? 'Crear dato' : 'Editar dato'} className="space-y-3 rounded-md border border-neutral-200 bg-white p-3" onSubmit={(event) => { event.preventDefault(); props.onSubmit() }}>
      <div>
        <label htmlFor="def-label" className="block text-sm font-medium text-neutral-800">Nombre del dato *</label>
        <input id="def-label" className={INPUT} value={form.label} disabled={props.busy} onChange={(event) => set({ label: event.target.value })} />
        {form.mode === 'edit' && <p className="text-xs text-neutral-500">Cambiar el nombre mantiene los valores guardados, pero los moldes aprobados con este dato vuelven a quedar pendientes de aprobación.</p>}
      </div>
      <div>
        <label htmlFor="def-type" className="block text-sm font-medium text-neutral-800">Tipo de dato</label>
        <select id="def-type" className={INPUT} value={form.dataType} disabled={props.busy || form.mode === 'edit'} onChange={(event) => set({ dataType: event.target.value as SpecDataType })}>
          {Object.entries(SPEC_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {form.mode === 'edit' && <p className="text-xs text-neutral-500">El tipo no se puede cambiar una vez creado el dato.</p>}
      </div>
      {form.dataType === 'NUMBER' && (
        <div>
          <label htmlFor="def-unit" className="block text-sm font-medium text-neutral-800">Unidad</label>
          <input id="def-unit" className={INPUT} value={form.unit} disabled={props.busy} onChange={(event) => set({ unit: event.target.value })} placeholder="Ej.: mm, V, MP" />
        </div>
      )}
      {takesOptions(form.dataType) && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-800">Opciones</legend>
          {form.rows.map((row, index) => (
            <div key={row.key} className="flex items-center gap-2">
              <input aria-label={`Opción ${index + 1}`} className={INPUT} value={row.label} disabled={props.busy} onChange={(event) => set({ rows: form.rows.map((item) => (item.key === row.key ? { ...item, label: event.target.value } : item)) })} />
              <label className="flex items-center gap-1 text-xs text-neutral-700"><input type="checkbox" checked={row.isActive} disabled={props.busy} onChange={(event) => set({ rows: form.rows.map((item) => (item.key === row.key ? { ...item, isActive: event.target.checked } : item)) })} />Activa</label>
            </div>
          ))}
          <label htmlFor="def-new-options" className="block text-xs text-neutral-600">{form.rows.length ? 'Agregar opciones nuevas' : 'Escribe las opciones'} (una por línea)</label>
          <textarea id="def-new-options" rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={form.newLines} disabled={props.busy} onChange={(event) => set({ newLines: event.target.value })} />
          <p className="text-xs text-neutral-500">Las opciones no se eliminan: se desactivan para conservar el historial.</p>
        </fieldset>
      )}
      {form.mode === 'edit' && (
        <label className="flex items-center gap-2 text-sm text-neutral-800"><input type="checkbox" checked={form.isActive} disabled={props.busy} onChange={(event) => set({ isActive: event.target.checked })} />Dato activo</label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={props.busy}>{form.mode === 'create' ? 'Crear dato' : 'Guardar cambios'}</button>
        <button type="button" className={BTN_PLAIN} onClick={props.onCancel} disabled={props.busy}>Cancelar</button>
      </div>
    </form>
  )
}

export function DefinitionsView(props: DefinitionsViewProps) {
  const selected = props.rows.find((row) => row.key === props.selectedKey) ?? null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="master-search" className="block text-sm font-medium text-neutral-800">Buscar datos</label>
          <input id="master-search" type="search" className={INPUT} value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Escribe un nombre" />
        </div>
        {props.canWrite && <button type="button" className={BTN_PRIMARY} onClick={props.onNew} disabled={props.busy}>Nuevo dato</button>}
      </div>
      <p className="text-xs text-neutral-500" aria-live="polite">{props.loading ? 'Cargando…' : `${props.rows.length} ${props.rows.length === 1 ? 'resultado' : 'resultados'}`}</p>
      {props.error && <ErrorNotice error={props.error} />}
      {props.formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{props.formError}</p>}
      {props.impact && (
        <div role="alertdialog" aria-label="Confirmar impacto" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Este cambio afecta otros registros</p>
          <p>{props.impact.error.message}</p>
          {props.impact.lines.length > 0 && <ul className="list-disc pl-5">{props.impact.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={props.onConfirmImpact} disabled={props.busy}>Sí, aplicar el cambio</button>
            <button type="button" className={BTN_PLAIN} onClick={props.onCancelImpact} disabled={props.busy}>No, dejar como está</button>
          </div>
        </div>
      )}
      {props.canWrite && props.form && <DefinitionFormView props={props} form={props.form} />}
      <div className="grid gap-3 lg:grid-cols-2">
        <ul aria-label="Datos del diccionario" className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {props.rows.length === 0 && !props.loading && <li className="p-3 text-sm text-neutral-600">No hay datos que coincidan.</li>}
          {props.rows.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => props.onSelect(row.key === props.selectedKey ? null : row.key)} aria-current={row.key === props.selectedKey ? 'true' : undefined} className="flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm">
                <span className="font-medium text-neutral-800">{row.label}{!row.isActive && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-700">Inactivo</span>}</span>
                <span className="text-xs text-neutral-500">{SPEC_TYPE_LABELS[row.dataType] ?? row.dataType}{row.unit ? ` · ${row.unit}` : ''}{takesOptions(row.dataType) ? ` · ${row.options.length} opción(es)` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <section aria-label={`Detalle de ${selected.label}`} className="space-y-3 rounded-md border border-neutral-200 bg-white p-3">
            <h4 className="text-base font-semibold text-neutral-800">{selected.label}</h4>
            <p className="text-sm text-neutral-600">Tipo: {SPEC_TYPE_LABELS[selected.dataType] ?? selected.dataType}{selected.unit ? ` · Unidad: ${selected.unit}` : ''} · Estado: {selected.isActive ? 'Activo' : 'Inactivo'}</p>
            {selected.options.length > 0 && (
              <ul aria-label="Opciones" className="flex flex-wrap gap-1.5">
                {selected.options.map((option) => <li key={option.key} className={`rounded px-2 py-1 text-xs ${option.isActive ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-50 text-neutral-400 line-through'}`}>{option.label}</li>)}
              </ul>
            )}
            <UsagePanelLite usage={props.usage} loading={props.usageLoading} />
            {props.canWrite ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PLAIN} onClick={props.onEdit} disabled={props.busy}>Editar</button>
                <button type="button" className={BTN_PLAIN} onClick={props.onToggleActive} disabled={props.busy}>{selected.isActive ? 'Desactivar' : 'Activar'}</button>
              </div>
            ) : <p className="text-xs text-neutral-500">Solo consulta: no puedes modificar el diccionario.</p>}
            <p className="text-xs text-neutral-500">Los datos del diccionario no se eliminan: se desactivan para conservar el historial.</p>
          </section>
        )}
      </div>
    </div>
  )
}

/** Dictionary usage is informational (nothing is deleted), so it reuses the usage wording without the delete verdict. */
function UsagePanelLite({ usage, loading }: { usage: { counts: Record<string, number> } | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-neutral-500">Revisando dónde se usa…</p>
  if (!usage) return null
  const lines = usageCountLines(usage.counts)
  return (
    <div aria-label="Uso" className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <h4 className="font-semibold text-neutral-700">Dónde se usa</h4>
      {lines.length === 0 ? <p className="text-neutral-600">No se usa en moldes ni productos.</p> : <ul className="list-disc pl-5 text-neutral-700">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>
  )
}

// --------------------------------------------------------------------- molds

export interface MoldsViewProps {
  subcategories: { id: string; name: string; categoryName?: string }[]
  subcategoryId: string
  onSubcategory: (id: string) => void
  loading: boolean
  mold: MoldView | null
  usage: MoldUsage | null
  /** true only with products:approveSpecs; masters:write never implies it. */
  canApprove: boolean
  approvingKey: string | null
  onAskApprove: (specKey: string | null) => void
  reason: string
  onReason: (value: string) => void
  onApprove: () => void
  busy: boolean
  error: MasterError | null
}

export function MoldsView(props: MoldsViewProps) {
  const entries = props.mold?.entries ?? []
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="mold-subcategory" className="block text-sm font-medium text-neutral-800">Subcategoría</label>
        <select id="mold-subcategory" className={INPUT} value={props.subcategoryId} onChange={(event) => props.onSubcategory(event.target.value)}>
          <option value="">Elige una subcategoría</option>
          {props.subcategories.map((item) => <option key={item.id} value={item.id}>{item.categoryName ? `${item.categoryName} › ${item.name}` : item.name}</option>)}
        </select>
      </div>
      {props.error && <ErrorNotice error={props.error} />}
      {props.usage && (
        <p className="text-sm text-neutral-700" aria-label="Resumen del molde">
          Molde: {props.usage.counts.approved} aprobado(s), {props.usage.counts.proposed} propuesto(s), {props.usage.counts.retired} retirado(s) · {props.usage.counts.products} producto(s) lo usan.
        </p>
      )}
      {props.subcategoryId && !props.loading && entries.length === 0 && <p className="text-sm text-neutral-600">Esta subcategoría todavía no tiene molde.</p>}
      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Molde de datos clave</caption>
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr><th scope="col" className="px-3 py-2">Dato</th><th scope="col" className="px-3 py-2">Tipo</th><th scope="col" className="px-3 py-2">Obligatorio</th><th scope="col" className="px-3 py-2">Sirve como filtro</th><th scope="col" className="px-3 py-2">Estado</th>{props.canApprove && <th scope="col" className="px-3 py-2"><span className="sr-only">Acción</span></th>}</tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((entry: MoldEntry) => (
                <tr key={entry.specKey}>
                  <td className="px-3 py-2 font-medium text-neutral-800">{entry.label}</td>
                  <td className="px-3 py-2">{SPEC_TYPE_LABELS[entry.dataType] ?? entry.dataType}{entry.unit ? ` (${entry.unit})` : ''}</td>
                  <td className="px-3 py-2">{entry.isRequired ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2">{entry.isFilterable ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2">{TEMPLATE_STATUS_LABELS[entry.status] ?? entry.status}</td>
                  {props.canApprove && (
                    <td className="px-3 py-2">
                      {canShowApproveButton(props.canApprove, entry.status) && <button type="button" className={BTN_PLAIN} disabled={props.busy} onClick={() => props.onAskApprove(entry.specKey)}>Aprobar</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.canApprove && props.approvingKey && (
        <div role="alertdialog" aria-label="Confirmar aprobación" className="space-y-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <p>Aprobar «{entries.find((entry) => entry.specKey === props.approvingKey)?.label}» deja el dato como parte oficial del molde. Queda registrada tu aprobación.</p>
          <label htmlFor="approve-reason" className="block text-xs">Motivo (obligatorio si el dato es obligatorio y no tiene justificación)</label>
          <input id="approve-reason" className={INPUT} value={props.reason} onChange={(event) => props.onReason(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={props.onApprove} disabled={props.busy}>Sí, aprobar</button>
            <button type="button" className={BTN_PLAIN} onClick={() => props.onAskApprove(null)} disabled={props.busy}>Cancelar</button>
          </div>
        </div>
      )}
      {!props.canApprove && entries.length > 0 && <p className="text-xs text-neutral-500">La aprobación de los datos del molde se hace con un acceso aparte; aquí solo puedes consultar su estado.</p>}
    </div>
  )
}

// ----------------------------------------------------------------- container

export default function DictionarySection({ canWrite }: { canWrite: boolean }) {
  const client = useQueryClient()
  const canApprove = useHasAssignedAction(['products:approveSpecs'])
  const [tab, setTab] = useState<'datos' | 'moldes'>('datos')

  // definitions
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [form, setForm] = useState<DefinitionForm | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [error, setError] = useState<MasterError | null>(null)
  const [impact, setImpact] = useState<{ error: MasterError; lines: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const decision = useRef<((yes: boolean) => void) | null>(null)

  const defs = useQuery({ queryKey: mastersKeys.definitions, queryFn: () => fetchSpecDefinitions(), refetchOnWindowFocus: false })
  const rows = (defs.data ?? []).filter((row) => matchesQuery(query, row.label, row.key))
  const selected = (defs.data ?? []).find((row) => row.key === selectedKey) ?? null
  const usage = useQuery({ queryKey: [...mastersKeys.definitions, 'usage', selectedKey], queryFn: () => fetchSpecDefinitionUsage(selectedKey as string), enabled: !!selectedKey, refetchOnWindowFocus: false })

  const refresh = () => client.invalidateQueries({ queryKey: mastersKeys.definitions })

  const submit = async () => {
    if (!form) return
    const problem = validateDefinitionForm(form)
    if (problem) { setFormError(problem); return }
    setFormError(null); setError(null); setBusy(true)
    try {
      if (form.mode === 'create') {
        const options = buildOptionsPayload(form)
        await createSpecDefinition({
          key: snakeKey(form.label),
          label: form.label.trim(),
          dataType: form.dataType,
          ...(form.dataType === 'NUMBER' && form.unit.trim() ? { unit: form.unit.trim() } : {}),
          ...(takesOptions(form.dataType) ? { options } : {}),
        })
        await refresh(); setForm(null)
      } else if (selected) {
        const outcome = await runWithImpactConfirmation(
          (confirmImpact) => updateSpecDefinition(selected.key, buildDefinitionUpdate(selected, form, confirmImpact)),
          (mapped) => new Promise<boolean>((resolve) => { decision.current = resolve; setBusy(false); setImpact({ error: mapped, lines: impactLines(mapped.impact) }) }),
        )
        setImpact(null)
        if (!('cancelled' in outcome)) { await refresh(); setForm(null) }
      }
    } catch (caught) {
      setImpact(null); setError(mapMasterError(caught))
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    if (!selected) return
    setError(null); setBusy(true)
    try {
      const outcome = await runWithImpactConfirmation(
        (confirmImpact) => updateSpecDefinition(selected.key, { isActive: !selected.isActive, ...(confirmImpact ? { confirmImpact: true } : {}) }),
        (mapped) => new Promise<boolean>((resolve) => { decision.current = resolve; setBusy(false); setImpact({ error: mapped, lines: impactLines(mapped.impact) }) }),
      )
      setImpact(null)
      if (!('cancelled' in outcome)) await refresh()
    } catch (caught) {
      setImpact(null); setError(mapMasterError(caught))
    } finally {
      setBusy(false)
    }
  }

  const decide = (yes: boolean) => { if (yes) setBusy(true); decision.current?.(yes); decision.current = null }

  // molds
  const [subcategoryId, setSubcategoryId] = useState('')
  const [approvingKey, setApprovingKey] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [moldError, setMoldError] = useState<MasterError | null>(null)
  const [approving, setApproving] = useState(false)
  const subs = useQuery({ queryKey: mastersKeys.subcategories, queryFn: () => fetchSubcategories(), enabled: tab === 'moldes', refetchOnWindowFocus: false })
  const mold = useQuery({ queryKey: mastersKeys.template(subcategoryId), queryFn: () => fetchMold(subcategoryId), enabled: tab === 'moldes' && !!subcategoryId, refetchOnWindowFocus: false })
  const moldUsage = useQuery({ queryKey: mastersKeys.templateUsage(subcategoryId), queryFn: () => fetchMoldUsage(subcategoryId), enabled: tab === 'moldes' && !!subcategoryId, refetchOnWindowFocus: false })

  const approve = async () => {
    if (!approvingKey) return
    setMoldError(null); setApproving(true)
    try {
      await approveMoldEntry(subcategoryId, approvingKey, reason.trim() || undefined)
      setApprovingKey(null); setReason('')
      await Promise.all([client.invalidateQueries({ queryKey: mastersKeys.template(subcategoryId) }), client.invalidateQueries({ queryKey: mastersKeys.templateUsage(subcategoryId) })])
    } catch (caught) {
      setMoldError(mapMasterError(caught))
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Diccionario y moldes" className="flex gap-2">
        {([['datos', 'Diccionario de datos'], ['moldes', 'Moldes por subcategoría']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`${BTN} ${tab === id ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-neutral-300 text-neutral-700'}`}>{label}</button>
        ))}
      </div>
      {tab === 'datos' ? (
        <DefinitionsView
          rows={rows}
          loading={defs.isLoading}
          query={query}
          onQuery={setQuery}
          canWrite={canWrite}
          selectedKey={selectedKey}
          onSelect={(key) => { setSelectedKey(key); setForm(null); setError(null) }}
          usage={usage.data ?? null}
          usageLoading={usage.isLoading && !!selectedKey}
          form={form}
          onForm={setForm}
          onSubmit={submit}
          onCancel={() => { setForm(null); setFormError(null) }}
          onNew={() => { setForm(emptyDefinitionForm()); setFormError(null); setError(null) }}
          onEdit={() => selected && (setForm(formFromDefinition(selected)), setFormError(null), setError(null))}
          onToggleActive={toggleActive}
          busy={busy}
          error={error ?? (defs.error ? mapMasterError(defs.error) : null)}
          formError={formError}
          impact={impact}
          onConfirmImpact={() => decide(true)}
          onCancelImpact={() => decide(false)}
        />
      ) : (
        <MoldsView
          subcategories={(subs.data ?? []).map((item) => ({ id: item.id, name: item.name, categoryName: item.category?.name }))}
          subcategoryId={subcategoryId}
          onSubcategory={(id) => { setSubcategoryId(id); setApprovingKey(null); setMoldError(null) }}
          loading={mold.isLoading}
          mold={mold.data ?? null}
          usage={moldUsage.data ?? null}
          canApprove={canApprove}
          approvingKey={approvingKey}
          onAskApprove={(key) => { setApprovingKey(key); setReason('') }}
          reason={reason}
          onReason={setReason}
          onApprove={approve}
          busy={approving}
          error={moldError ?? (subs.error ? mapMasterError(subs.error) : mold.error ? mapMasterError(mold.error) : null)}
        />
      )}
    </div>
  )
}
