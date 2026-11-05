import { useState, type ReactNode } from 'react'
import { Alert, Badge, Button } from '../../../components/ui'
import { useSubcategoryChangePreview } from '../hooks/useKeySpecs'
import { classificationMissingParts, findSubcategory, isClassificationIncomplete } from '../lib/classification'
import { describeChangePreview, summarizeChangePreview } from '../lib/key-specs'
import type { ClassificationRoot, SubcategoryChangePreview } from '../types/key-specs.types'

const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm disabled:bg-neutral-50 disabled:text-neutral-500'
const labelClass = 'block text-sm font-medium text-neutral-700 mb-1.5'
const hintClass = 'text-xs text-neutral-500 mt-1'
const touchButton = 'min-h-[44px]'

export interface ClassificationFieldsProps {
  tree: ClassificationRoot[] | undefined
  loading?: boolean
  failed?: boolean
  /** Subcategory shown as chosen (saved value plus unsaved edit). */
  subcategoryId: string
  brandId: string
  /** Name of the product's saved category, shown while no subcategory is chosen. */
  fallbackRootName?: string
  /** Name of the saved subcategory, kept selectable if it left the active tree. */
  fallbackSubcategoryName?: string
  disabled?: boolean
  /** The subcategory the person picked and has not confirmed yet. */
  pendingId: string | null
  onPick: (subcategoryId: string) => void
  children?: ReactNode
}

/** Root category (read-only, derived), subcategory select grouped by root, and the "Por clasificar" state. */
export function ClassificationFields({
  tree,
  loading,
  failed,
  subcategoryId,
  brandId,
  fallbackRootName,
  fallbackSubcategoryName,
  disabled,
  pendingId,
  onPick,
  children,
}: ClassificationFieldsProps) {
  const roots = tree ?? []
  const shown = pendingId ?? subcategoryId
  const found = findSubcategory(roots, shown)
  const rootName = found?.root.name ?? (subcategoryId ? undefined : fallbackRootName) ?? 'Sin categoría'
  const incomplete = isClassificationIncomplete({ subcategoryId, brandId })
  const missing = classificationMissingParts({ subcategoryId, brandId })
  const savedMissingFromTree = Boolean(shown) && !found

  return (
    <div className="space-y-3" aria-label="Clasificación del producto" role="group">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-neutral-800">Clasificación</h4>
        {incomplete ? (
          <Badge variant="warning">Por clasificar</Badge>
        ) : (
          <Badge variant="success">Clasificado</Badge>
        )}
        {incomplete && <span className="text-xs text-neutral-600">Falta: {missing.join(' y ')}. Puedes guardar como borrador.</span>}
      </div>

      {failed && <Alert variant="warning">No se pudo cargar la lista de subcategorías. Recarga la página para elegir una.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className={labelClass}>Categoría principal</span>
          <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700" data-testid="classification-root">
            {rootName}
          </p>
          <p className={hintClass}>Se completa sola al elegir la subcategoría.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="editor-subcategory">
            Subcategoría
          </label>
          <select
            id="editor-subcategory"
            value={shown}
            disabled={disabled || loading || failed}
            onChange={(event) => event.target.value && onPick(event.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              {loading ? 'Cargando…' : 'Elegir subcategoría…'}
            </option>
            {savedMissingFromTree && <option value={shown}>{fallbackSubcategoryName ?? 'Subcategoría actual'} (ya no está activa)</option>}
            {roots.map((root) => (
              <optgroup key={root.id} label={root.name}>
                {root.subcategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className={hintClass}>Al cambiarla verás qué pasa con los datos clave antes de confirmar.</p>
        </div>
      </div>
      {children}
    </div>
  )
}

export interface SubcategoryChangeReviewProps {
  targetName: string
  status: 'loading' | 'error' | 'ready'
  preview?: SubcategoryChangePreview
  onConfirm: () => void
  onCancel: () => void
}

function NameList({ title, items }: { title: string; items: { label: string; note?: string }[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-neutral-700">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
        {items.map((item) => (
          <li key={item.label}>
            {item.label}
            {item.note && <span className="text-xs text-neutral-500"> ({item.note})</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What changes in the key data if the subcategory changes. Nothing is applied until the person confirms. */
export function SubcategoryChangeReview({ targetName, status, preview, onConfirm, onCancel }: SubcategoryChangeReviewProps) {
  const summary = preview ? summarizeChangePreview(preview) : null
  return (
    <section
      aria-label="Revisar el cambio de subcategoría"
      className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
      data-testid="subcategory-change-review"
    >
      <h5 className="text-sm font-semibold text-neutral-800">Cambiar a «{targetName}»</h5>
      {status === 'loading' && (
        <div className="h-16 rounded-lg bg-neutral-100 motion-safe:animate-pulse" aria-busy="true" role="status">
          <span className="sr-only">Revisando el efecto del cambio…</span>
        </div>
      )}
      {status === 'error' && (
        <Alert variant="error">No se pudo revisar el efecto del cambio. Cancela e inténtalo de nuevo.</Alert>
      )}
      {status === 'ready' && preview && summary && (
        <div className="space-y-3">
          <ul className="space-y-0.5 text-sm text-neutral-700">
            {describeChangePreview(summary).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {summary.newlyRequired > 0 && (
            <p className="text-xs text-neutral-600">
              {summary.newlyRequired === 1 ? '1 de los datos nuevos es obligatorio.' : `${summary.newlyRequired} de los datos nuevos son obligatorios.`}
            </p>
          )}
          <NameList title="Se conservan" items={preview.kept.map((k) => ({ label: k.label }))} />
          <NameList title="Quedan por revisar" items={preview.needsReview.map((k) => ({ label: k.label }))} />
          <NameList
            title="Datos nuevos por completar"
            items={preview.newlyMissing.map((k) => ({
              label: k.label,
              note: k.status === 'PROPOSED' ? 'propuesto' : k.isRequired ? 'obligatorio' : undefined,
            }))}
          />
          {!summary.hasImpact && <p className="text-sm text-neutral-600">Este cambio no afecta datos clave guardados.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className={touchButton} onClick={onConfirm} disabled={status !== 'ready'}>
          Cambiar subcategoría
        </Button>
        <Button variant="secondary" className={touchButton} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-neutral-500">El cambio se guarda con «Guardar cambios». Los datos clave se conservan; ninguno se borra.</p>
    </section>
  )
}

export interface ClassificationSectionProps {
  productId: string
  tree: ClassificationRoot[] | undefined
  loading?: boolean
  failed?: boolean
  /** Saved subcategory of the product ('' when none). */
  savedSubcategoryId: string
  /** Subcategory including the unsaved edit. */
  subcategoryId: string
  brandId: string
  fallbackRootName?: string
  fallbackSubcategoryName?: string
  disabled?: boolean
  onChange: (subcategoryId: string) => void
}

/** Container: a picked subcategory is only applied after the change preview is shown and confirmed. */
export function ClassificationSection({ productId, savedSubcategoryId, onChange, ...fields }: ClassificationSectionProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const preview = useSubcategoryChangePreview(productId, pendingId)
  const targetName = findSubcategory(fields.tree ?? [], pendingId)?.subcategory.name ?? 'la nueva subcategoría'

  const pick = (id: string) => {
    if (id === fields.subcategoryId) {
      setPendingId(null)
      return
    }
    // Going back to the saved subcategory discards an earlier unconfirmed pick: nothing to review.
    if (id === savedSubcategoryId) {
      onChange(id)
      setPendingId(null)
      return
    }
    setPendingId(id)
  }

  return (
    <ClassificationFields {...fields} pendingId={pendingId} onPick={pick}>
      {pendingId && (
        <SubcategoryChangeReview
          targetName={targetName}
          status={preview.isError ? 'error' : preview.data ? 'ready' : 'loading'}
          preview={preview.data}
          onConfirm={() => {
            onChange(pendingId)
            setPendingId(null)
          }}
          onCancel={() => setPendingId(null)}
        />
      )}
    </ClassificationFields>
  )
}
