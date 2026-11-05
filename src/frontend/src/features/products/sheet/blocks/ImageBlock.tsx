import { useSheetDraft } from '../SheetDraftContext'
import { Field, inputClass, invalidClass } from './sheet-fields'

/** Store-only image of the sheet (empty = the photos of the Imágenes section are used). */
export function ImageBlock() {
  const { form, set, errors } = useSheetDraft()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Imagen de la ficha (URL)" error={errors.imageUrl} hint="Vacío = se usan las fotos de la sección Imágenes.">
        <input type="text" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} className={`${inputClass} ${errors.imageUrl ? invalidClass : ''}`} />
      </Field>
      <Field label="Texto alternativo de la imagen">
        <input type="text" value={form.imageAlt} onChange={(e) => set('imageAlt', e.target.value)} className={inputClass} />
      </Field>
    </div>
  )
}
