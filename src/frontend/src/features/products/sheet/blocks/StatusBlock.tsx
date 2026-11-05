import { useSheetDraft } from '../SheetDraftContext'
import type { SheetForm } from '../sheet-form'
import { Field, inputClass } from './sheet-fields'

/** Store status of the product: Vigente or Descontinuado. Used alone in Datos generales and inside StoreBlock. */
export function StatusBlock() {
  const { form, set } = useSheetDraft()
  return (
    <Field label="Estado en la tienda">
      <select value={form.status} onChange={(e) => set('status', e.target.value as SheetForm['status'])} className={inputClass}>
        <option value="ACTIVE">Vigente</option>
        <option value="DISCONTINUED">Descontinuado</option>
      </select>
    </Field>
  )
}
