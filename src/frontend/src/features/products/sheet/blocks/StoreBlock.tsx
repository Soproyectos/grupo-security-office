import { useSheetDraft } from '../SheetDraftContext'
import { Field, disclosureSummaryClass, inputClass } from './sheet-fields'
import { StatusBlock } from './StatusBlock'

/** Name, reference, store status and store brand: what the customer reads first. */
export function StoreBlock() {
  const { form, set } = useSheetDraft()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <Field label="Nombre que ve el cliente" hint="Vacío = el nombre del producto.">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Referencia (modelo)" hint="Vacío = usa la referencia (SKU) del producto.">
        <input type="text" value={form.model} onChange={(e) => set('model', e.target.value)} className={inputClass} />
      </Field>
      <StatusBlock />
      <div className="md:col-span-2">
        <details open={Boolean(form.brand)}>
          <summary className={disclosureSummaryClass}>Usar otra marca en la tienda</summary>
          <div className="mt-3">
            <Field label="Marca en la tienda" hint="Se toma de la marca del producto (Información general) y ya no se escribe a mano, para que no la contradiga.">
              <input type="text" value={form.brand} readOnly aria-readonly="true" className={`${inputClass} bg-neutral-50 text-neutral-500`} />
            </Field>
          </div>
        </details>
      </div>
    </div>
  )
}
