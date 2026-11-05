import { LIMITS } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { TextListEditor } from './sheet-fields'

/** Short selling points, in order. They never set price or stock. */
export function HighlightsBlock() {
  const { form, set, errors } = useSheetDraft()
  return (
    <TextListEditor
      rows={form.highlights}
      onChange={(rows) => set('highlights', rows)}
      noun="Destacado"
      placeholder="Ej. Compresión H.265+ adaptativa"
      addLabel="Agregar destacado"
      multiline
      error={errors.highlights}
      max={LIMITS.highlights}
    />
  )
}
