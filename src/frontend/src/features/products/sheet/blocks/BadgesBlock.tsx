import { LIMITS } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { TextListEditor } from './sheet-fields'

/** Short labels shown next to the product name in the store. */
export function BadgesBlock({ showTitle = true, showHint = true }: { showTitle?: boolean; showHint?: boolean }) {
  const { form, set, errors } = useSheetDraft()
  return (
    <div className="space-y-1">
      {showTitle && <p className="text-sm font-medium text-neutral-700">Etiquetas</p>}
      {showHint && <p className="text-xs text-neutral-500">Textos cortos junto al nombre, como «Destacado».</p>}
      <TextListEditor
        rows={form.badges}
        onChange={(rows) => set('badges', rows)}
        noun="Etiqueta"
        placeholder="Ej. Destacado"
        addLabel="Agregar etiqueta"
        error={errors.badges}
        max={LIMITS.badges}
      />
    </div>
  )
}
