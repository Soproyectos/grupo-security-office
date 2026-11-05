import { useEffect, useState } from 'react'
import { Alert, Button } from '../../../../components/ui'
import { versionConflictMessage } from '../sheet-form'
import { saveEditorParts } from '../editor-save'
import { useOptionalSheetDraft } from '../SheetDraftContext'

const RECENT_SAVE_MS = 5000

export interface EditorSaveBarProps {
  /** General data (page fields) have changes not saved yet. */
  datosDirty: boolean
  datosSaving: boolean
  /** Error of the general data: validation or server. */
  datosError: string | null
  /** Saves the general data. Resolves true when saved. */
  onSaveDatos: () => Promise<boolean>
  /** Drops the unsaved general data. Shown only while they are dirty. */
  onDiscardDatos?: () => void
  /** Product name saved in this run, only when it changed. The store sheet takes it as its name. */
  syncName?: string
}

/**
 * The one save bar of the product editor. It saves the general data first and then the store sheet.
 * With no sheet draft (not allowed or not loaded) it saves only the general data.
 */
export function EditorSaveBar({ datosDirty, datosSaving, datosError, onSaveDatos, onDiscardDatos, syncName }: EditorSaveBarProps) {
  const draft = useOptionalSheetDraft()
  const [running, setRunning] = useState(false)
  const [recent, setRecent] = useState<{ sheet: boolean } | null>(null)

  const sheetDirty = Boolean(draft?.dirty)
  const sheetSaving = Boolean(draft?.saving)
  const sheetConflict = draft?.conflict ?? null
  const sheetSaveError = draft?.saveError ?? null
  const sheetInvalidCount = draft?.showErrors ? draft.errorCount : 0

  const dirty = datosDirty || sheetDirty
  const busy = running || datosSaving || sheetSaving
  const hasError = Boolean(datosError || sheetConflict || sheetSaveError || sheetInvalidCount > 0)
  const visible = dirty || busy || hasError || recent !== null

  // The "Todo guardado" confirmation fades on its own after a few seconds.
  useEffect(() => {
    if (!recent) return
    const timeout = window.setTimeout(() => setRecent(null), RECENT_SAVE_MS)
    return () => window.clearTimeout(timeout)
  }, [recent])

  if (!visible) return null

  const dirtyParts = [datosDirty ? 'Datos generales' : '', sheetDirty ? 'Ficha de la tienda' : ''].filter(Boolean)

  const save = async () => {
    setRunning(true)
    setRecent(null)
    try {
      // Without a sheet draft there is no sheet to rename: only the general data are saved.
      const ok = await saveEditorParts({
        datosDirty,
        sheetDirty,
        syncName: draft ? syncName : undefined,
        saveDatos: onSaveDatos,
        saveSheet: (options) => (draft ? draft.handleSubmit({ preventDefault: () => undefined }, options) : Promise.resolve(false)),
      })
      if (ok) setRecent({ sheet: sheetDirty || (Boolean(draft) && syncName !== undefined) })
    } finally {
      setRunning(false)
    }
  }

  let status = 'No se guardó. Revisa el aviso de arriba.'
  if (busy) status = 'Guardando cambios…'
  else if (dirty) status = `Cambios sin guardar en: ${dirtyParts.join(', ')}`
  else if (recent) status = 'Todo guardado'

  return (
    <div className="biblioteca-editor__savebar space-y-2" data-testid="editor-save-bar">
      {datosError && <Alert variant="error">{datosError}</Alert>}
      {draft?.showErrors && draft.errorCount > 0 && (
        <Alert variant="error">
          Corrige {draft.errorCount} {draft.errorCount === 1 ? 'campo' : 'campos'} de la ficha marcado{draft.errorCount === 1 ? '' : 's'} antes de guardar.
        </Alert>
      )}
      {sheetConflict && (
        <Alert variant="error">
          <span className="block">{versionConflictMessage(sheetConflict)}</span>
          {draft?.onReload && (
            <Button type="button" variant="secondary" className="mt-2" onClick={draft.onReload}>
              Descartar cambios y recargar
            </Button>
          )}
        </Alert>
      )}
      {!sheetConflict && sheetSaveError && <Alert variant="error">{sheetSaveError}</Alert>}
      {recent?.sheet && !dirty && !busy && (
        <p className="text-xs text-neutral-600">La tienda puede tardar hasta 5 minutos en mostrar los cambios de la ficha (caché del navegador).</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={`min-w-0 text-sm ${dirty ? 'font-medium text-amber-800' : 'text-neutral-700'}`}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {datosDirty && onDiscardDatos && (
            <Button variant="secondary" disabled={busy} onClick={onDiscardDatos}>
              Descartar
            </Button>
          )}
          <Button disabled={!dirty || busy} loading={busy} onClick={() => void save()}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  )
}
