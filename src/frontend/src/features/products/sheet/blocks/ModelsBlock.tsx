import { LIMITS } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { TextListEditor } from './sheet-fields'

/** Models the sheet and the firmware apply to. */
export function ModelsBlock() {
  const { form, set, errors } = useSheetDraft()
  return (
    <TextListEditor
      rows={form.availableModels}
      onChange={(rows) => set('availableModels', rows)}
      noun="Modelo"
      placeholder="Ej. iDS-E04HQHI-D"
      addLabel="Agregar modelo"
      error={errors.availableModels}
      max={LIMITS.availableModels}
    />
  )
}
