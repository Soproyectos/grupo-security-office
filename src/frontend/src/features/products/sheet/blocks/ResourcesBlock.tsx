import { useState } from 'react'
import { Button } from '../../../../components/ui'
import { getApiErrorMessage } from '../../../../lib/apiError'
import { AUTHORIZED_DOWNLOAD_NOTICE, uploadHintFor } from '../document-assets'
import {
  DOCUMENT_KINDS,
  FIRMWARE_KINDS,
  LIMITS,
  RESOURCE_KIND_LABELS,
  appendItem,
  moveWithinGroup,
  newResource,
  removeAt,
  replaceAt,
  sectionOfKind,
  type ResourceRow,
  type ResourceSection,
  type SheetErrors,
  type SheetResourceKind,
} from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'
import { Field, RowControls, inputClass, invalidClass } from './sheet-fields'

// ------------------------------ One list per section (documents or firmware) ------------------------------

function ResourcesSection({
  section,
  resources,
  errors,
  onChange,
  onUploadAsset,
}: {
  section: ResourceSection
  resources: ResourceRow[]
  errors: SheetErrors
  onChange: (resources: ResourceRow[]) => void
  /** CAT-04 (D5): subida verificada de documentos (solo la sección documents). */
  onUploadAsset?: (file: File) => Promise<{ url: string }>
}) {
  const kinds = section === 'firmware' ? FIRMWARE_KINDS : DOCUMENT_KINDS
  const noun = section === 'firmware' ? 'firmware' : 'documento'
  const inSection = (r: ResourceRow) => sectionOfKind(r.kind) === section
  const entries = resources.map((row, index) => ({ row, index })).filter(({ row }) => inSection(row))
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)

  const handleUpload = async (index: number, file: File | undefined) => {
    if (!file || !onUploadAsset) return
    setUploadingIndex(index)
    setUploadError(null)
    try {
      const { url } = await onUploadAsset(file)
      const current = resources[index]
      if (current) {
        onChange(replaceAt(resources, index, { ...current, url, fileName: current.fileName || file.name }))
      }
    } catch (error) {
      setUploadError(getApiErrorMessage(error, 'No se pudo subir el documento. El contenido real debe ser PDF o imagen; máximo 16 MB.'))
    } finally {
      setUploadingIndex(null)
    }
  }

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
          <div key={row.uid} className="border-t border-neutral-200 pt-4 first:border-t-0 first:pt-0 space-y-3" data-testid={`resource-${section}`}>
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
                    <div className="flex gap-2">
                      <input type="text" value={row.url} onChange={(e) => update(index, { url: e.target.value })} className={`${inputClass} ${err('url') ? invalidClass : ''}`} />
                      {section === 'documents' && onUploadAsset && (
                        <label className={`shrink-0 inline-flex items-center gap-1 px-3 text-xs font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-50 ${uploadingIndex === index ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                          {uploadingIndex === index ? 'Subiendo…' : 'Subir archivo…'}
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              void handleUpload(index, f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </Field>
                  {row.requiresLicense && (
                    <p role="note" data-testid="authorized-download-notice" className="text-xs text-amber-700 mt-1">
                      {AUTHORIZED_DOWNLOAD_NOTICE}
                    </p>
                  )}
                </div>
                {section === 'documents' && (
                  <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-4">
                    <input type="checkbox" checked={row.requiresLicense} onChange={(e) => update(index, { requiresLicense: e.target.checked })} />
                    Descarga autorizada (el archivo queda privado: solo con acceso al producto)
                  </label>
                )}
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
      {uploadError && (
        <p role="alert" className="text-xs text-red-600">
          {uploadError}
        </p>
      )}
      {uploadHintFor(section) && (
        <p role="note" data-testid="firmware-upload-deferred" className="text-xs text-neutral-500">
          {uploadHintFor(section)}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={resources.length >= LIMITS.resources} onClick={() => onChange(appendItem(resources, newResource(section)))}>
        {section === 'firmware' ? 'Agregar firmware o notas de versión' : 'Agregar documento'}
      </Button>
    </div>
  )
}

/** Downloadable documents, firmware files and the firmware note. */
export function ResourcesBlock() {
  const { form, set, errors, onUploadAsset } = useSheetDraft()
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-neutral-800">Documentos técnicos</h4>
        <ResourcesSection section="documents" resources={form.resources} errors={errors} onChange={(r) => set('resources', r)} onUploadAsset={onUploadAsset} />
      </div>
      <div className="space-y-2 border-t border-neutral-200 pt-6">
        <h4 className="text-sm font-semibold text-neutral-800">Firmware</h4>
        <ResourcesSection section="firmware" resources={form.resources} errors={errors} onChange={(r) => set('resources', r)} />
        <Field label="Nota sobre el firmware" hint="Se muestra junto a los archivos de firmware.">
          <textarea rows={3} value={form.firmwareNote} onChange={(e) => set('firmwareNote', e.target.value)} className={inputClass} />
        </Field>
      </div>
      {errors.resources && (
        <p role="alert" className="text-xs text-red-600">
          {errors.resources}
        </p>
      )}
    </div>
  )
}
