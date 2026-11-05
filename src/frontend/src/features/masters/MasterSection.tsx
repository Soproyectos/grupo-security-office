import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  impactLines,
  mapMasterError,
  matchesQuery,
  runWithImpactConfirmation,
  usageSummary,
  type MasterError,
  type NameResolver,
  type UsageReport,
} from './masters-rules'

export type FormValues = Record<string, string | boolean>

export interface FieldDef {
  name: string
  label: string
  kind: 'text' | 'select' | 'checkbox'
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
  disabled?: boolean
}

export interface MasterRowView {
  id: string
  name: string
  detail?: string
  active: boolean
  counts: string[]
}

export interface MasterAdapter<T extends { id: string }> {
  queryKey: readonly unknown[]
  label: string
  /** Singular, lowercase: "categoría". */
  singular: string
  load: () => Promise<T[]>
  toRow: (item: T) => MasterRowView
  searchText: (item: T) => unknown[]
  fields: (item: T | null) => FieldDef[]
  initialValues: (item: T | null) => FormValues
  validate: (values: FormValues) => string | null
  create: (values: FormValues) => Promise<unknown>
  update: (item: T, values: FormValues, confirmImpact: boolean) => Promise<unknown>
  setActive: (item: T, next: boolean) => Promise<unknown>
  remove: (item: T) => Promise<unknown>
  usage: (item: T) => Promise<UsageReport>
  resolveName?: NameResolver
  /** Shown above the create form. */
  createNote?: string
  /** Extra query keys to refresh after a change. */
  alsoInvalidate?: readonly (readonly unknown[])[]
}

export interface MasterSectionViewProps {
  label: string
  singular: string
  rows: MasterRowView[]
  loading: boolean
  loadError: MasterError | null
  query: string
  onQuery: (value: string) => void
  canWrite: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  usage: UsageReport | null
  usageLoading: boolean
  form: null | {
    mode: 'create' | 'edit'
    fields: FieldDef[]
    values: FormValues
    note?: string
    busy: boolean
    onChange: (name: string, value: string | boolean) => void
    onSubmit: () => void
    onCancel: () => void
  }
  formError: string | null
  error: MasterError | null
  impact: { error: MasterError; lines: string[] } | null
  onConfirmImpact: () => void
  onCancelImpact: () => void
  deleteTarget: string | null
  onNew: () => void
  onEdit: () => void
  onToggleActive: () => void
  onAskDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  busy: boolean
}

const BTN = 'inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'
const BTN_PRIMARY = `${BTN} border-[var(--color-primary)] bg-[var(--color-primary)] text-white`
const BTN_PLAIN = `${BTN} border-neutral-300 text-neutral-700`
const BTN_DANGER = `${BTN} border-red-300 text-red-700`

export function ErrorNotice({ error }: { error: MasterError }) {
  const tone = error.kind === 'unsupported' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'
  return (
    <div role={error.kind === 'unsupported' ? 'status' : 'alert'} className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
      <p>{error.message}</p>
      {error.kind === 'delete_blocked' && error.reasons && error.reasons.length > 0 && (
        <ul className="mt-1 list-disc pl-5">{error.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      )}
    </div>
  )
}

export function UsagePanel({ usage, loading }: { usage: UsageReport | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-neutral-500">Revisando dónde se usa…</p>
  if (!usage) return null
  const summary = usageSummary(usage)
  return (
    <div aria-label="Uso" className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <h4 className="font-semibold text-neutral-700">Dónde se usa</h4>
      {summary.lines.length === 0 ? <p className="text-neutral-600">No se usa en ningún otro registro.</p> : <ul className="list-disc pl-5 text-neutral-700">{summary.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
      {summary.canDelete
        ? <p className="text-emerald-800">Se puede eliminar.</p>
        : <p className="text-amber-900">No se puede eliminar{summary.blockers.length ? `: ${summary.blockers.join('; ')}` : ''}. Puedes desactivarlo para que deje de usarse sin perder historial.</p>}
    </div>
  )
}

function FormFields({ form }: { form: NonNullable<MasterSectionViewProps['form']> }) {
  return (
    <form
      aria-label={form.mode === 'create' ? 'Crear' : 'Editar'}
      className="space-y-3 rounded-md border border-neutral-200 bg-white p-3"
      onSubmit={(event) => { event.preventDefault(); form.onSubmit() }}
    >
      {form.note && <p role="note" className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">{form.note}</p>}
      {form.fields.map((field) => {
        const id = `master-field-${field.name}`
        const value = form.values[field.name]
        return (
          <div key={field.name} className="space-y-1">
            {field.kind === 'checkbox' ? (
              <label htmlFor={id} className="flex items-center gap-2 text-sm text-neutral-800">
                <input id={id} type="checkbox" checked={value === true} disabled={field.disabled || form.busy} onChange={(event) => form.onChange(field.name, event.target.checked)} />
                {field.label}
              </label>
            ) : (
              <>
                <label htmlFor={id} className="block text-sm font-medium text-neutral-800">{field.label}{field.required ? ' *' : ''}</label>
                {field.kind === 'select' ? (
                  <select id={id} className="min-h-11 w-full rounded-md border border-neutral-300 px-3 text-sm" value={typeof value === 'string' ? value : ''} disabled={field.disabled || form.busy} onChange={(event) => form.onChange(field.name, event.target.value)}>
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input id={id} type="text" className="min-h-11 w-full rounded-md border border-neutral-300 px-3 text-sm" value={typeof value === 'string' ? value : ''} disabled={field.disabled || form.busy} onChange={(event) => form.onChange(field.name, event.target.value)} />
                )}
              </>
            )}
            {field.hint && <p className="text-xs text-neutral-500">{field.hint}</p>}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={form.busy}>{form.mode === 'create' ? 'Crear' : 'Guardar cambios'}</button>
        <button type="button" className={BTN_PLAIN} onClick={form.onCancel} disabled={form.busy}>Cancelar</button>
      </div>
    </form>
  )
}

/** Presentational list + detail + form of one master catalog. Write controls only when `canWrite`. */
export function MasterSectionView(props: MasterSectionViewProps) {
  const selected = props.rows.find((row) => row.id === props.selectedId) ?? null
  const summary = props.usage ? usageSummary(props.usage) : null
  const cannotDelete = !!summary && !summary.canDelete
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="master-search" className="block text-sm font-medium text-neutral-800">Buscar {props.label.toLowerCase()}</label>
          <input id="master-search" type="search" className="min-h-11 w-full rounded-md border border-neutral-300 px-3 text-sm" value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Escribe un nombre" />
        </div>
        {props.canWrite && <button type="button" className={BTN_PRIMARY} onClick={props.onNew} disabled={props.busy}>Nueva {props.singular}</button>}
      </div>
      <p className="text-xs text-neutral-500" aria-live="polite">{props.loading ? 'Cargando…' : `${props.rows.length} ${props.rows.length === 1 ? 'resultado' : 'resultados'}`}</p>

      {props.loadError && <ErrorNotice error={props.loadError} />}
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

      {props.form && <FormFields form={props.form} />}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ul aria-label={props.label} className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {props.rows.length === 0 && !props.loading && <li className="p-3 text-sm text-neutral-600">No hay {props.label.toLowerCase()} que coincidan.</li>}
          {props.rows.map((row) => (
            <li key={row.id}>
              <button type="button" aria-current={row.id === props.selectedId ? 'true' : undefined} onClick={() => props.onSelect(row.id === props.selectedId ? null : row.id)} className={`flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${row.id === props.selectedId ? 'bg-[var(--color-primary-bg-subtle)]' : ''}`}>
                <span className="font-medium text-neutral-800">{row.name}{!row.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-700">Inactiva</span>}</span>
                {row.detail && <span className="text-xs text-neutral-500">{row.detail}</span>}
                {row.counts.length > 0 && <span className="text-xs text-neutral-600">{row.counts.join(' · ')}</span>}
              </button>
            </li>
          ))}
        </ul>

        {selected && (
          <section aria-label={`Detalle de ${selected.name}`} className="space-y-3 rounded-md border border-neutral-200 bg-white p-3">
            <h4 className="text-base font-semibold text-neutral-800">{selected.name}</h4>
            <p className="text-sm text-neutral-600">Estado: {selected.active ? 'Activa' : 'Inactiva'}</p>
            <UsagePanel usage={props.usage} loading={props.usageLoading} />
            {props.canWrite ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PLAIN} onClick={props.onEdit} disabled={props.busy}>Editar</button>
                <button type="button" className={BTN_PLAIN} onClick={props.onToggleActive} disabled={props.busy}>{selected.active ? 'Desactivar' : 'Activar'}</button>
                <button type="button" className={BTN_DANGER} onClick={props.onAskDelete} disabled={props.busy || props.usageLoading || cannotDelete} title={cannotDelete ? 'Está en uso: desactívala en lugar de eliminarla' : undefined}>Eliminar</button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Solo consulta: no puedes modificar este catálogo.</p>
            )}
            {props.deleteTarget === selected.id && (
              <div role="alertdialog" aria-label="Confirmar eliminación" className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                <p>¿Eliminar «{selected.name}»? Esta acción no se puede deshacer.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={BTN_DANGER} onClick={props.onConfirmDelete} disabled={props.busy}>Sí, eliminar</button>
                  <button type="button" className={BTN_PLAIN} onClick={props.onCancelDelete} disabled={props.busy}>Cancelar</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

/** Container: loads the list and wires the adapter operations to the view. */
export default function MasterSection<T extends { id: string }>({ adapter, canWrite }: { adapter: MasterAdapter<T>; canWrite: boolean }) {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'create' | 'edit' | null>(null)
  const [values, setValues] = useState<FormValues>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [error, setError] = useState<MasterError | null>(null)
  const [impact, setImpact] = useState<{ error: MasterError; lines: string[] } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const impactDecision = useRef<((yes: boolean) => void) | null>(null)

  const list = useQuery({ queryKey: adapter.queryKey, queryFn: adapter.load, refetchOnWindowFocus: false })
  const items = list.data ?? []
  const selected = items.find((item) => item.id === selectedId) ?? null
  const rows = useMemo(
    () => items.filter((item) => matchesQuery(query, ...adapter.searchText(item))).map(adapter.toRow),
    [items, query, adapter],
  )
  const usageQuery = useQuery({
    queryKey: [...adapter.queryKey, 'usage', selectedId],
    queryFn: () => adapter.usage(selected as T),
    enabled: !!selected,
    refetchOnWindowFocus: false,
  })

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: adapter.queryKey })
    for (const key of adapter.alsoInvalidate ?? []) await client.invalidateQueries({ queryKey: key as unknown[] })
  }

  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
  })

  const closeForm = () => { setMode(null); setFormError(null) }

  const guarded = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await run.mutateAsync(action)
      return true
    } catch (caught) {
      setError(mapMasterError(caught))
      return false
    }
  }

  const submit = async () => {
    const problem = adapter.validate(values)
    if (problem) { setFormError(problem); return }
    setFormError(null)
    setError(null)
    if (mode === 'create') {
      if (await guarded(() => adapter.create(values))) closeForm()
      return
    }
    if (!selected) return
    setSubmitting(true)
    try {
      const outcome = await runWithImpactConfirmation(
        (confirmImpact) => adapter.update(selected, values, confirmImpact),
        (mapped) => new Promise<boolean>((resolve) => {
          impactDecision.current = resolve
          setSubmitting(false)
          setImpact({ error: mapped, lines: impactLines(mapped.impact, adapter.resolveName) })
        }),
      )
      setImpact(null)
      if (!('cancelled' in outcome)) { await refresh(); closeForm() }
    } catch (caught) {
      setImpact(null)
      setError(mapMasterError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  const decideImpact = (yes: boolean) => {
    if (yes) setSubmitting(true)
    impactDecision.current?.(yes)
    impactDecision.current = null
  }

  const fields = adapter.fields(mode === 'edit' ? selected : null)

  return (
    <MasterSectionView
      label={adapter.label}
      singular={adapter.singular}
      rows={rows}
      loading={list.isLoading}
      loadError={list.error ? mapMasterError(list.error) : null}
      query={query}
      onQuery={setQuery}
      canWrite={canWrite}
      selectedId={selectedId}
      onSelect={(id) => { setSelectedId(id); closeForm(); setDeleteTarget(null); setError(null) }}
      usage={usageQuery.data ?? null}
      usageLoading={usageQuery.isLoading && !!selected}
      form={canWrite && mode
        ? {
            mode,
            fields,
            values,
            note: mode === 'create' ? adapter.createNote : undefined,
            busy: run.isPending || submitting,
            onChange: (name, value) => setValues((current) => ({ ...current, [name]: value })),
            onSubmit: submit,
            onCancel: closeForm,
          }
        : null}
      formError={formError}
      error={error}
      impact={impact}
      onConfirmImpact={() => decideImpact(true)}
      onCancelImpact={() => decideImpact(false)}
      deleteTarget={deleteTarget}
      onNew={() => { setMode('create'); setValues(adapter.initialValues(null)); setFormError(null); setError(null) }}
      onEdit={() => { if (selected) { setMode('edit'); setValues(adapter.initialValues(selected)); setFormError(null); setError(null) } }}
      onToggleActive={() => { if (selected) void guarded(() => adapter.setActive(selected, !adapter.toRow(selected).active)) }}
      onAskDelete={() => selected && setDeleteTarget(selected.id)}
      onConfirmDelete={async () => {
        if (!selected) return
        if (await guarded(() => adapter.remove(selected))) { setDeleteTarget(null); setSelectedId(null) }
        else setDeleteTarget(null)
      }}
      onCancelDelete={() => setDeleteTarget(null)}
      busy={run.isPending || submitting}
    />
  )
}
