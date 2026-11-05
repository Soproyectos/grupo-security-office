import { Button } from '../../../../components/ui'
import { FeatureGlyph } from '../../components/icons'
import { FEATURE_ICONS, FEATURE_ICON_LABELS, LIMITS, appendItem, moveItem, newFeature, removeAt, replaceAt, type SheetFeatureIcon } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { RowControls, inputClass, invalidClass } from './sheet-fields'

/** Short icon-and-text items shown under the product title. */
export function FeaturesBlock() {
  const { form, set, errors } = useSheetDraft()
  return (
    <div className="space-y-2">
      {form.features.length === 0 && <p className="text-sm text-neutral-400">Sin elementos todavía.</p>}
      {form.features.map((feature, index) => {
        const labelError = errors[`features.${index}.label`]
        return (
          <div key={feature.uid} className="flex items-start gap-2" data-testid="feature-row">
            <span className="mt-2 text-neutral-600" aria-hidden="true">
              <FeatureGlyph icon={feature.icon} width="1.4em" height="1.4em" />
            </span>
            <select
              aria-label={`Ícono de la característica ${index + 1}`}
              value={feature.icon}
              onChange={(e) => set('features', replaceAt(form.features, index, { ...feature, icon: e.target.value as SheetFeatureIcon }))}
              className={`${inputClass} w-48`}
            >
              {FEATURE_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {FEATURE_ICON_LABELS[icon]}
                </option>
              ))}
            </select>
            <div className="grow">
              <input
                type="text"
                aria-label={`Texto de la característica ${index + 1}`}
                placeholder="Ej. AcuSense"
                value={feature.label}
                onChange={(e) => set('features', replaceAt(form.features, index, { ...feature, label: e.target.value }))}
                className={`${inputClass} ${labelError ? invalidClass : ''}`}
              />
              {labelError && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {labelError}
                </p>
              )}
            </div>
            <RowControls
              index={index}
              count={form.features.length}
              noun="característica"
              onMove={(d) => set('features', moveItem(form.features, index, d))}
              onRemove={() => set('features', removeAt(form.features, index))}
            />
          </div>
        )
      })}
      {errors.features && (
        <p role="alert" className="text-xs text-red-600">
          {errors.features}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={form.features.length >= LIMITS.features} onClick={() => set('features', appendItem(form.features, newFeature()))}>
        Agregar característica
      </Button>
    </div>
  )
}
