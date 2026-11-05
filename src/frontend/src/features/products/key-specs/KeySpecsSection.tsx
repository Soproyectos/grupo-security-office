import { useEffect, useMemo, useState } from 'react'
import { Alert, Button } from '../../../components/ui'
import { useKeySpecValues, useMissingKeySpecs, useSaveKeySpecs, useSpecTemplate } from '../hooks/useKeySpecs'
import {
  applySaveResults,
  baselineDraft,
  buildEntries,
  buildLayout,
  describeStoredValue,
  missingList,
  rejectionMessage,
  summarizeResults,
  type KeySpecDraft,
  type KeySpecLayout,
} from '../lib/key-specs'
import type { KeySpecItem, KeySpecWriteResult, MissingKeySpec } from '../types/key-specs.types'
import { KeySpecField } from './KeySpecField'
import { MissingKeySpecsPanel } from './MissingKeySpecsPanel'

export interface KeySpecsFormProps {
  layout: KeySpecLayout
  drafts: Record<string, KeySpecDraft>
  /** Local problems (by specKey), shown under their field. */
  localErrors: Record<string, string>
  results: KeySpecWriteResult[] | null
  missing: MissingKeySpec[]
  missingLoading?: boolean
  readOnly?: boolean
  saving?: boolean
  saveFailed?: boolean
  dirtyCount: number
  onDraftChange: (specKey: string, draft: KeySpecDraft) => void
  onSave: () => void
  onDiscard: () => void
}

function ResultsList({ results, labels }: { results: KeySpecWriteResult[]; labels: Map<string, string> }) {
  const summary = summarizeResults(results)
  const shown = results.filter((result) => result.outcome !== 'unchanged')
  return (
    <section aria-label="Resultado del guardado" className="space-y-2" data-testid="key-spec-results">
      <Alert variant={summary.rejected > 0 ? 'warning' : 'success'}>
        {summary.rejected > 0
          ? `Se guardaron ${summary.saved} y ${summary.rejected === 1 ? '1 no se pudo guardar' : `${summary.rejected} no se pudieron guardar`}. Los que quedaron bien ya están guardados.`
          : summary.saved > 0
            ? `Se guardaron ${summary.saved === 1 ? '1 dato' : `${summary.saved} datos`}.`
            : 'No había cambios que guardar.'}
      </Alert>
      {shown.length > 0 && (
        <ul className="space-y-1 text-sm">
          {shown.map((result) => (
            <li key={result.specKey} className={result.outcome === 'rejected' ? 'text-[var(--color-error)]' : 'text-neutral-700'}>
              <span className="font-medium">{labels.get(result.specKey) ?? result.specKey}</span>
              {': '}
              {result.outcome === 'saved' ? 'guardado' : rejectionMessage(result)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Presentational "Datos clave" form: fields in template order, then values that need review. */
export function KeySpecsForm({
  layout,
  drafts,
  localErrors,
  results,
  missing,
  missingLoading,
  readOnly,
  saving,
  saveFailed,
  dirtyCount,
  onDraftChange,
  onSave,
  onDiscard,
}: KeySpecsFormProps) {
  const rejected = new Map((results ?? []).filter((r) => r.outcome === 'rejected').map((r) => [r.specKey, rejectionMessage(r)]))
  const labels = new Map([...layout.rows, ...layout.review].map((row) => [row.item.specKey, row.item.label]))
  const draftOf = (item: KeySpecItem) => drafts[item.specKey] ?? baselineDraft(item)

  return (
    <div className="space-y-4">
      <MissingKeySpecsPanel missing={missing} loading={missingLoading} />

      {layout.rows.length === 0 ? (
        <p className="text-sm text-neutral-600" data-testid="key-specs-empty">
          Esta subcategoría todavía no tiene datos clave definidos.
        </p>
      ) : (
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
          {layout.rows.map((row) => (
            <KeySpecField
              key={row.item.specKey}
              row={row}
              draft={draftOf(row.item)}
              error={localErrors[row.item.specKey] ?? rejected.get(row.item.specKey)}
              disabled={readOnly}
              onChange={(draft) => onDraftChange(row.item.specKey, draft)}
            />
          ))}
        </fieldset>
      )}

      {layout.review.length > 0 && (
        <section aria-label="Requieren revisión" className="space-y-3 border-t border-neutral-200 pt-4" data-testid="key-specs-review">
          <div>
            <h4 className="text-sm font-semibold text-neutral-800">Requieren revisión</h4>
            <p className="text-xs text-neutral-500">
              Estos datos ya estaban guardados pero esta subcategoría no los pide. No se borran: revisa si siguen sirviendo.
            </p>
          </div>
          <ul className="space-y-1 text-sm text-neutral-700">
            {layout.review.map((row) => (
              <li key={row.item.specKey}>
                <span className="font-medium">{row.item.label}</span>: {describeStoredValue(row.item)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {results && <ResultsList results={results} labels={labels} />}
      {saveFailed && <Alert variant="error">No se pudieron guardar los datos clave. Revisa tu conexión e inténtalo de nuevo.</Alert>}

      {!readOnly && layout.rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-700" role="status" aria-live="polite">
            {dirtyCount > 0 ? (dirtyCount === 1 ? '1 dato sin guardar' : `${dirtyCount} datos sin guardar`) : 'Sin cambios pendientes'}
          </p>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <Button type="button" variant="secondary" className="min-h-[44px]" disabled={saving} onClick={onDiscard}>
                Descartar
              </Button>
            )}
            <Button type="button" className="min-h-[44px]" loading={saving} disabled={dirtyCount === 0 || saving} onClick={onSave}>
              Guardar datos clave
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export interface KeySpecsSectionProps {
  productId: string
  /** Subcategory saved on the server; the template follows it. */
  savedSubcategoryId: string
  /** The person picked another subcategory and has not saved it yet. */
  subcategoryUnsaved: boolean
  canEdit: boolean
  onDirtyChange?: (dirty: boolean) => void
}

/** Container: loads template, values and missing items, keeps the unsaved edits and saves them on request. */
export function KeySpecsSection({ productId, savedSubcategoryId, subcategoryUnsaved, canEdit, onDirtyChange }: KeySpecsSectionProps) {
  const values = useKeySpecValues(productId)
  const template = useSpecTemplate(savedSubcategoryId || null)
  const missing = useMissingKeySpecs(productId)
  const save = useSaveKeySpecs(productId)
  const [drafts, setDrafts] = useState<Record<string, KeySpecDraft>>({})
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [results, setResults] = useState<KeySpecWriteResult[] | null>(null)

  const items = useMemo(() => values.data?.items ?? [], [values.data])
  const layout = useMemo(() => buildLayout(items, template.data), [items, template.data])
  const built = useMemo(() => buildEntries(items, drafts), [items, drafts])
  const dirtyCount = built.entries.length + Object.keys(built.errors).length

  useEffect(() => {
    onDirtyChange?.(dirtyCount > 0)
  }, [dirtyCount, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  if (!savedSubcategoryId) {
    return (
      <p className="text-sm text-neutral-600" data-testid="key-specs-no-subcategory">
        Elige una subcategoría en «Datos generales» y guárdala para ver los datos clave que le corresponden.
      </p>
    )
  }
  if (values.isLoading || template.isLoading) {
    return <div className="h-40 rounded-xl bg-neutral-100 motion-safe:animate-pulse" aria-busy="true" />
  }
  if (values.isError || template.isError) {
    return <Alert variant="error">No se pudieron cargar los datos clave. Recarga la página.</Alert>
  }

  const change = (specKey: string, draft: KeySpecDraft) => {
    setDrafts((prev) => ({ ...prev, [specKey]: draft }))
    setLocalErrors((prev) => {
      if (!(specKey in prev)) return prev
      const { [specKey]: _removed, ...rest } = prev
      return rest
    })
  }

  const submit = async () => {
    setLocalErrors(built.errors)
    if (built.entries.length === 0) return
    try {
      const saved = await save.mutateAsync(built.entries)
      setResults(saved)
      setDrafts((prev) => applySaveResults(prev, saved))
    } catch {
      // The failure is shown by saveFailed; the edits stay in place.
    }
  }

  return (
    <div className="space-y-4">
      {subcategoryUnsaved && (
        <Alert variant="info">
          Elegiste otra subcategoría. Guarda los cambios generales para ver sus datos clave; mientras tanto se muestran los de la subcategoría guardada.
        </Alert>
      )}
      <KeySpecsForm
        layout={layout}
        drafts={drafts}
        localErrors={localErrors}
        results={results}
        missing={missingList(missing.data)}
        missingLoading={missing.isLoading}
        readOnly={!canEdit || subcategoryUnsaved}
        saving={save.isPending}
        saveFailed={save.isError}
        dirtyCount={dirtyCount}
        onDraftChange={change}
        onSave={() => void submit()}
        onDiscard={() => {
          setDrafts({})
          setLocalErrors({})
          setResults(null)
        }}
      />
    </div>
  )
}
