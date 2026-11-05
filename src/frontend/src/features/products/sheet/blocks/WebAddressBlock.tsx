import { useSheetDraft } from '../SheetDraftContext'
import { Field, inputClass, invalidClass } from './sheet-fields'

/** Public web address (slug) of the product and whether it may be opened by that address. */
export function WebAddressBlock() {
  const { form, set, errors } = useSheetDraft()
  const slugHref = form.slug.trim() && form.published ? `/productos/${form.slug.trim()}` : null
  return (
    <div className="space-y-4">
      <Field label="Slug" error={errors.slug} hint="Dirección /productos/slug. Solo minúsculas, números y guiones.">
        <input type="text" value={form.slug} onChange={(e) => set('slug', e.target.value)} className={`${inputClass} font-mono ${errors.slug ? invalidClass : ''}`} />
      </Field>
      <label className="flex items-center gap-2 min-h-[44px] md:min-h-0 text-sm text-neutral-700">
        <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} />
        Permitir abrir la ficha por su dirección (slug)
      </label>
      {slugHref && (
        <a href={slugHref} target="_blank" rel="noreferrer" className="inline-block text-sm text-security-600 hover:text-security-700 underline">
          Ver por slug
        </a>
      )}
    </div>
  )
}
