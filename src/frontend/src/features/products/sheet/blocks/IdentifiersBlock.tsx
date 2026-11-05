import { LIMITS } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { TextListEditor } from './sheet-fields'

/** Manufacturer identifiers (part numbers, EAN). Edited here, never shown as customer copy. */
export function IdentifiersBlock({ showTitle = true }: { showTitle?: boolean }) {
  const { form, set, errors } = useSheetDraft()
  return (
    <div className="space-y-1">
      {showTitle && <p className="text-sm font-medium text-neutral-700">Identificadores del fabricante</p>}
      <TextListEditor
        rows={form.manufacturerRefs}
        onChange={(rows) => set('manufacturerRefs', rows)}
        noun="Identificador"
        placeholder="Ej. Part number, EAN…"
        addLabel="Agregar identificador"
        error={errors.manufacturerRefs}
        max={LIMITS.manufacturerRefs}
      />
    </div>
  )
}
