import { Button } from '../../../../components/ui'
import { SpecGroupsMasterDetail } from '../SpecGroupsMasterDetail'
import { LIMITS, appendItem, moveItem, newSpecItem, removeAt, replaceAt, type SheetErrors, type SpecGroupRow } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { Field, RowControls, inputClass, invalidClass } from './sheet-fields'

/** Rows of one specification group. Shown inside the master-detail panel. */
function SpecGroupEditor({
  group,
  index,
  errors,
  onChange,
}: {
  group: SpecGroupRow
  index: number
  errors: SheetErrors
  onChange: (group: SpecGroupRow) => void
}) {
  const titleError = errors[`specGroups.${index}.title`]
  return (
    <div className="space-y-3" data-testid="spec-group">
      <div className="flex items-start gap-2">
        <div className="grow">
          <input
            type="text"
            aria-label={`Título del grupo ${index + 1}`}
            placeholder="Título del grupo (ej. Video y audio)"
            value={group.title}
            onChange={(e) => onChange({ ...group, title: e.target.value })}
            className={`${inputClass} font-medium ${titleError ? invalidClass : ''}`}
          />
          {titleError && (
            <p role="alert" className="text-xs text-red-600 mt-1">
              {titleError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {group.items.length === 0 && <p className="text-sm text-neutral-400">Este grupo no tiene filas.</p>}
        {group.items.map((item, itemIndex) => {
          const labelError = errors[`specGroups.${index}.items.${itemIndex}.label`]
          const valueError = errors[`specGroups.${index}.items.${itemIndex}.value`]
          return (
            <div key={item.uid} className="flex flex-col sm:flex-row sm:items-start gap-2" data-testid="spec-item">
              <div className="sm:w-2/5">
                <input
                  type="text"
                  aria-label={`Nombre de la fila ${itemIndex + 1} del grupo ${index + 1}`}
                  placeholder="Nombre"
                  value={item.label}
                  onChange={(e) => onChange({ ...group, items: replaceAt(group.items, itemIndex, { ...item, label: e.target.value }) })}
                  className={`${inputClass} ${labelError ? invalidClass : ''}`}
                />
                {labelError && (
                  <p role="alert" className="text-xs text-red-600 mt-1">
                    {labelError}
                  </p>
                )}
              </div>
              <div className="grow">
                <textarea
                  rows={2}
                  aria-label={`Valor de la fila ${itemIndex + 1} del grupo ${index + 1}`}
                  placeholder="Valor (admite varias líneas)"
                  value={item.value}
                  onChange={(e) => onChange({ ...group, items: replaceAt(group.items, itemIndex, { ...item, value: e.target.value }) })}
                  className={`${inputClass} ${valueError ? invalidClass : ''}`}
                />
                {valueError && (
                  <p role="alert" className="text-xs text-red-600 mt-1">
                    {valueError}
                  </p>
                )}
              </div>
              <RowControls
                index={itemIndex}
                count={group.items.length}
                noun="fila"
                onMove={(d) => onChange({ ...group, items: moveItem(group.items, itemIndex, d) })}
                onRemove={() => onChange({ ...group, items: removeAt(group.items, itemIndex) })}
              />
            </div>
          )
        })}
        <Button
          type="button"
          variant="secondary"
          disabled={group.items.length >= LIMITS.itemsPerGroup}
          onClick={() => onChange({ ...group, items: appendItem(group.items, newSpecItem()) })}
        >
          Agregar fila
        </Button>
        {group.items.length >= LIMITS.itemsPerGroup && <p className="text-xs text-neutral-600">Llegaste al máximo de {LIMITS.itemsPerGroup} filas por grupo.</p>}
      </div>
    </div>
  )
}

/** Specification groups (master-detail) and the note printed under their table. */
export function SpecGroupsBlock() {
  const { form, set, errors } = useSheetDraft()
  return (
    <div className="space-y-4">
      <SpecGroupsMasterDetail
        groups={form.specGroups}
        errors={errors}
        onChange={(groups) => set('specGroups', groups)}
        renderPanel={(group, index) => (
          <SpecGroupEditor group={group} index={index} errors={errors} onChange={(next) => set('specGroups', replaceAt(form.specGroups, index, next))} />
        )}
      />
      {errors.specGroups && (
        <p role="alert" className="text-xs text-red-600">
          {errors.specGroups}
        </p>
      )}
      <Field label="Aviso al pie de la tabla" hint="Se muestra al pie de la tabla de especificaciones.">
        <textarea rows={3} value={form.specsDisclaimer} onChange={(e) => set('specsDisclaimer', e.target.value)} className={inputClass} />
      </Field>
    </div>
  )
}
