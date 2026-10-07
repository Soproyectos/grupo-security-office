import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button } from '../../../components/ui'
import { FeatureGlyph } from '../components/icons'
import { FichaSection } from './FichaSection'
import {
  DOCUMENT_KINDS,
  FEATURE_ICONS,
  FEATURE_ICON_LABELS,
  FIRMWARE_KINDS,
  LIMITS,
  RESOURCE_KIND_LABELS,
  appendItem,
  moveItem,
  moveWithinGroup,
  newFeature,
  newResource,
  newSpecGroup,
  newSpecItem,
  newTextRow,
  removeAt,
  replaceAt,
  sectionOfKind,
  snapshot,
  toForm,
  toPayload,
  validateForm,
  type ResourceRow,
  type ResourceSection,
  type SheetErrors,
  type SheetForm,
  type SheetFeatureIcon,
  type SheetResourceKind,
  type ProductSheetApi,
  type ProductSheetPayload,
  type SpecGroupRow,
  type TextRow,
} from './sheet-form'

const inputClass =
  'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm bg-white'
const invalidClass = 'border-red-400'
const iconButtonClass =
  'px-2 py-1 text-xs rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed'

export const SHEET_SECTIONS = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'destacados', label: 'Destacados' },
  { id: 'caracteristicas', label: 'Características' },
  { id: 'modelos', label: 'Modelos' },
  { id: 'especificaciones', label: 'Especificaciones' },
  { id: 'documentos', label: 'Documentos y firmware' },
  { id: 'notas', label: 'Notas' },
] as const

// ------------------------------ Small building blocks ------------------------------

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-neutral-400">{hint}</span>}
      {error && (
        <span role="alert" className="block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  )
}

function RowControls({
  index,
  count,
  onMove,
  onRemove,
  noun,
}: {
  index: number
  count: number
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  noun: string
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" className={iconButtonClass} aria-label={`Subir ${noun} ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className={iconButtonClass} aria-label={`Bajar ${noun} ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)}>
        ↓
      </button>
      <button type="button" className={`${iconButtonClass} text-red-600 hover:bg-red-50`} aria-label={`Quitar ${noun} ${index + 1}`} onClick={onRemove}>
        Quitar
      </button>
    </div>
  )
}

function TextListEditor({
  rows,
  onChange,
  noun,
  placeholder,
  addLabel,
  multiline = false,
  error,
  max,
}: {
  rows: TextRow[]
  onChange: (rows: TextRow[]) => void
  noun: string
  placeholder: string
  addLabel: string
  multiline?: boolean
  error?: string
  max: number
}) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-neutral-400">Sin elementos todavía.</p>}
      {rows.map((row, index) => {
        const common = {
          value: row.value,
          placeholder,
          'aria-label': `${noun} ${index + 1}`,
          className: inputClass,
          onChange: (e: { target: { value: string } }) => onChange(replaceAt(rows, index, { ...row, value: e.target.value })),
        }
        return (
          <div key={row.uid} className="flex items-start gap-2">
            {multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
            <RowControls index={index} count={rows.length} noun={noun} onMove={(d) => onChange(moveItem(rows, index, d))} onRemove={() => onChange(removeAt(rows, index))} />
          </div>
        )
      })}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={rows.length >= max} onClick={() => onChange(appendItem(rows, newTextRow()))}>
        {addLabel}
      </Button>
    </div>
  )
}

// ------------------------------ Specifications ------------------------------

function SpecGroupEditor({
  group,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  group: SpecGroupRow
  index: number
  count: number
  errors: SheetErrors
  onChange: (group: SpecGroupRow) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const titleError = errors[`specGroups.${index}.title`]
  return (
    <div className="border border-neutral-200 rounded-lg p-4 space-y-3 bg-neutral-50/50" data-testid="spec-group">
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
        <RowControls index={index} count={count} noun="grupo" onMove={onMove} onRemove={onRemove} />
      </div>

      <div className="space-y-2">
        {group.items.length === 0 && <p className="text-sm text-neutral-400">Este grupo no tiene filas.</p>}
        {group.items.map((item, itemIndex) => {
          const labelError = errors[`specGroups.${index}.items.${itemIndex}.label`]
          const valueError = errors[`specGroups.${index}.items.${itemIndex}.value`]
          return (
            <div key={item.uid} className="flex items-start gap-2" data-testid="spec-item">
              <div className="w-2/5">
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
                  rows={1}
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
      </div>
    </div>
  )
}

// ------------------------------ Resources ------------------------------

function ResourcesSection({
  section,
  resources,
  errors,
  onChange,
}: {
  section: ResourceSection
  resources: ResourceRow[]
  errors: SheetErrors
  onChange: (resources: ResourceRow[]) => void
}) {
  const kinds = section === 'firmware' ? FIRMWARE_KINDS : DOCUMENT_KINDS
  const noun = section === 'firmware' ? 'firmware' : 'documento'
  const inSection = (r: ResourceRow) => sectionOfKind(r.kind) === section
  const entries = resources.map((row, index) => ({ row, index })).filter(({ row }) => inSection(row))

  const update = (index: number, patch: Partial<ResourceRow>) => {
    const current = resources[index]
    if (current) onChange(replaceAt(resources, index, { ...current, ...patch }))
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && <p className="text-sm text-neutral-400">Sin elementos todavía.</p>}
      {entries.map(({ row, index }, position) => {
        const err = (field: string) => errors[`resources.${index}.${field}`]
        return (
          <div key={row.uid} className="border border-neutral-200 rounded-lg p-4 space-y-3 bg-neutral-50/50" data-testid={`resource-${section}`}>
            <div className="flex items-start gap-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 grow">
                <Field label="Tipo">
                  <select value={row.kind} onChange={(e) => update(index, { kind: e.target.value as SheetResourceKind })} className={inputClass}>
                    {kinds.map((k) => (
                      <option key={k} value={k}>
                        {RESOURCE_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Título" error={err('title')}>
                    <input type="text" value={row.title} onChange={(e) => update(index, { title: e.target.value })} className={`${inputClass} ${err('title') ? invalidClass : ''}`} />
                  </Field>
                </div>
                <Field label="Idioma" error={err('language')} hint="es, en…">
                  <input type="text" value={row.language} onChange={(e) => update(index, { language: e.target.value })} className={`${inputClass} ${err('language') ? invalidClass : ''}`} />
                </Field>
                <div className="md:col-span-4">
                  <Field label="URL" error={err('url')} hint="https://… o una ruta /api/files/…">
                    <input type="text" value={row.url} onChange={(e) => update(index, { url: e.target.value })} className={`${inputClass} ${err('url') ? invalidClass : ''}`} />
                  </Field>
                </div>
                {section === 'documents' ? (
                  <div className="md:col-span-2">
                    <Field label="Nombre de archivo (opcional)">
                      <input type="text" value={row.fileName} onChange={(e) => update(index, { fileName: e.target.value })} className={inputClass} />
                    </Field>
                  </div>
                ) : (
                  <>
                    <Field label="Versión">
                      <input type="text" value={row.version} onChange={(e) => update(index, { version: e.target.value })} className={inputClass} />
                    </Field>
                    <Field label="Región">
                      <input type="text" value={row.region} onChange={(e) => update(index, { region: e.target.value })} className={inputClass} />
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2 mt-6">
                      <input type="checkbox" checked={row.requiresLicense} onChange={(e) => update(index, { requiresLicense: e.target.checked })} />
                      Requiere aceptar licencia antes de descargar
                    </label>
                  </>
                )}
              </div>
              <RowControls
                index={position}
                count={entries.length}
                noun={noun}
                onMove={(d) => onChange(moveWithinGroup(resources, index, d, inSection))}
                onRemove={() => onChange(removeAt(resources, index))}
              />
            </div>
          </div>
        )
      })}
      <Button type="button" variant="secondary" disabled={resources.length >= LIMITS.resources} onClick={() => onChange(appendItem(resources, newResource(section)))}>
        {section === 'firmware' ? 'Agregar firmware o notas de versión' : 'Agregar documento'}
      </Button>
    </div>
  )
}

// ------------------------------ Editor ------------------------------

export interface ProductSheetEditorProps {
  sheet: ProductSheetApi
  /** Product lifecycle in the store; the public sheet only exists for PUBLISHED products. */
  lifecycleStatus?: string | null
  saving: boolean
  saveError: string | null
  saved: boolean
  onSave: (payload: ProductSheetPayload) => void
  onDirtyChange?: (dirty: boolean) => void
  /** The page already renders one navigation for every block of the Ficha tab. */
  hideNav?: boolean
}

export function ProductSheetEditor({
  sheet,
  lifecycleStatus,
  saving,
  saveError,
  saved,
  onSave,
  onDirtyChange,
  hideNav = false,
}: ProductSheetEditorProps) {
  const [initial] = useState(() => toForm(sheet))
  const [form, setForm] = useState<SheetForm>(initial)
  const [showErrors, setShowErrors] = useState(false)
  const baseline = useMemo(() => snapshot(initial), [initial])

  const dirty = snapshot(form) !== baseline
  const allErrors = useMemo(() => validateForm(form), [form])
  const errors: SheetErrors = showErrors ? allErrors : {}
  const errorCount = Object.keys(allErrors).length

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const set = <K extends keyof SheetForm>(key: K, value: SheetForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (errorCount > 0) {
      setShowErrors(true)
      return
    }
    onSave(toPayload(form))
  }

  const publicHref = `/catalogo/productos/${sheet.productId}`
  const slugHref = form.slug.trim() && form.published ? `/productos/${form.slug.trim()}` : null

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate aria-label="Editor de la ficha del producto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">Ficha pública</h2>
          <p className="text-sm text-neutral-500">
            Lo que ve el cliente en la tienda. Estas secciones se guardan juntas con «Guardar ficha pública», al final.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a href={publicHref} target="_blank" rel="noreferrer" className="text-security-600 hover:text-security-700 underline">
            Ver ficha pública
          </a>
          {slugHref && (
            <a href={slugHref} target="_blank" rel="noreferrer" className="text-security-600 hover:text-security-700 underline">
              Ver por slug
            </a>
          )}
        </div>
      </div>

      {lifecycleStatus && lifecycleStatus !== 'PUBLISHED' && (
        <Alert variant="warning">
          El producto aún no está publicado en la tienda: la ficha pública no se verá hasta publicarlo (pestaña Publicación).
        </Alert>
      )}

      {!hideNav && (
        <nav aria-label="Secciones de la ficha" className="flex gap-1 flex-wrap">
          {SHEET_SECTIONS.map((s) => (
            <a key={s.id} href={`#ficha-${s.id}`} className="px-3 py-1.5 text-xs rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50">
              {s.label}
            </a>
          ))}
        </nav>
      )}

      <FichaSection id="identidad" title="Identidad" hint="Cómo se presenta el producto en su ficha. No cambia el nombre ni el SKU del producto en la Lista.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Field label="Nombre de ficha" hint="Si lo dejas vacío se usa el nombre del producto.">
              <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Slug" error={errors.slug} hint="Dirección pública /productos/slug. Solo minúsculas, números y guiones.">
            <input type="text" value={form.slug} onChange={(e) => set('slug', e.target.value)} className={`${inputClass} font-mono ${errors.slug ? invalidClass : ''}`} />
          </Field>
          <Field label="Estado">
            <select value={form.status} onChange={(e) => set('status', e.target.value as SheetForm['status'])} className={inputClass}>
              <option value="ACTIVE">Vigente</option>
              <option value="DISCONTINUED">Descontinuado</option>
            </select>
          </Field>
          <Field label="Marca (ficha)" hint="Vacío = marca del producto.">
            <input type="text" value={form.brand} onChange={(e) => set('brand', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Modelo (ficha)" hint="Vacío = SKU del producto.">
            <input type="text" value={form.model} onChange={(e) => set('model', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Imagen de la ficha (URL, opcional)" error={errors.imageUrl} hint="Vacío = fotos del producto. Para subir fotos usa la sección Fotos, más arriba.">
            <input type="text" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} className={`${inputClass} ${errors.imageUrl ? invalidClass : ''}`} />
          </Field>
          <Field label="Texto alternativo de la imagen">
            <input type="text" value={form.imageAlt} onChange={(e) => set('imageAlt', e.target.value)} className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2">
            <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} />
            Publicada: accesible también por su slug
          </label>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-700">Insignias</p>
          <TextListEditor
            rows={form.badges}
            onChange={(rows) => set('badges', rows)}
            noun="Insignia"
            placeholder="Ej. Destacado"
            addLabel="Agregar insignia"
            error={errors.badges}
            max={LIMITS.badges}
          />
        </div>
      </FichaSection>

      <FichaSection id="destacados" title="Destacados" hint="Frases cortas que aparecen junto a la imagen, en el orden indicado.">
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
      </FichaSection>

      <FichaSection id="caracteristicas" title="Características" hint="Íconos con texto breve que se muestran bajo el título.">
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
      </FichaSection>

      <FichaSection id="modelos" title="Modelos disponibles" hint="Referencias a las que aplica la ficha y el firmware.">
        <TextListEditor
          rows={form.availableModels}
          onChange={(rows) => set('availableModels', rows)}
          noun="Modelo"
          placeholder="Ej. iDS-E04HQHI-D"
          addLabel="Agregar modelo"
          error={errors.availableModels}
          max={LIMITS.availableModels}
        />
      </FichaSection>

      <FichaSection id="especificaciones" title="Especificaciones" hint="Grupos de especificaciones con sus filas, en el orden en que se muestran.">
        <div className="space-y-4">
          {form.specGroups.length === 0 && <p className="text-sm text-neutral-400">Sin grupos todavía.</p>}
          {form.specGroups.map((group, index) => (
            <SpecGroupEditor
              key={group.uid}
              group={group}
              index={index}
              count={form.specGroups.length}
              errors={errors}
              onChange={(next) => set('specGroups', replaceAt(form.specGroups, index, next))}
              onMove={(d) => set('specGroups', moveItem(form.specGroups, index, d))}
              onRemove={() => set('specGroups', removeAt(form.specGroups, index))}
            />
          ))}
          {errors.specGroups && (
            <p role="alert" className="text-xs text-red-600">
              {errors.specGroups}
            </p>
          )}
          <Button type="button" variant="secondary" disabled={form.specGroups.length >= LIMITS.specGroups} onClick={() => set('specGroups', appendItem(form.specGroups, newSpecGroup()))}>
            Agregar grupo
          </Button>
        </div>
      </FichaSection>

      <FichaSection id="documentos" title="Documentos y firmware" hint="Fichas técnicas, manuales y guías; y archivos de firmware o notas de versión (con licencia opcional).">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-700">Documentos</p>
            <ResourcesSection section="documents" resources={form.resources} errors={errors} onChange={(r) => set('resources', r)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-700">Firmware y notas de versión</p>
            <ResourcesSection section="firmware" resources={form.resources} errors={errors} onChange={(r) => set('resources', r)} />
          </div>
          {errors.resources && (
            <p role="alert" className="text-xs text-red-600">
              {errors.resources}
            </p>
          )}
        </div>
      </FichaSection>

      <FichaSection id="notas" title="Notas">
        <div className="grid grid-cols-1 gap-4">
          <Field label="Aviso de especificaciones (disclaimer)">
            <textarea rows={3} value={form.specsDisclaimer} onChange={(e) => set('specsDisclaimer', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Nota de firmware">
            <textarea rows={3} value={form.firmwareNote} onChange={(e) => set('firmwareNote', e.target.value)} className={inputClass} />
          </Field>
        </div>
      </FichaSection>

      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-white/95 backdrop-blur border-t border-neutral-200 space-y-2">
        {showErrors && errorCount > 0 && (
          <Alert variant="error">
            Corrige {errorCount} {errorCount === 1 ? 'campo' : 'campos'} marcado{errorCount === 1 ? '' : 's'} antes de guardar.
          </Alert>
        )}
        {saveError && <Alert variant="error">{saveError}</Alert>}
        {saved && !dirty && <Alert variant="success">Ficha guardada. La tienda puede tardar hasta 5 minutos en mostrar los cambios (caché del navegador).</Alert>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-500" aria-live="polite">
            {dirty ? 'Hay cambios sin guardar en la ficha pública.' : 'Sin cambios pendientes.'}
          </span>
          <Button type="submit" loading={saving} disabled={!dirty}>
            Guardar ficha pública
          </Button>
        </div>
      </div>
    </form>
  )
}
