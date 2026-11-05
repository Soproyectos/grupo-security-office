import { Alert, Button } from '../../../../components/ui'
import { PENDING_VALIDATION_NOTICE } from '../sheet-revisions'
import { versionConflictMessage } from '../sheet-form'
import { useSheetDraft } from '../SheetDraftContext'

/** Save bar of the sheet: errors, conflict, result and the save button. Hidden in embedded mode until there is something to read or save. */
export function SaveBar() {
  const { dirty, saving, saved, saveError, conflict, showErrors, errorCount, embedded, saveBarVisible, validation, onReload, handleSubmit } = useSheetDraft()
  const showSaveBar = !embedded || (saveBarVisible && (dirty || saving || saved || Boolean(saveError) || Boolean(conflict) || (showErrors && errorCount > 0)))
  if (!showSaveBar) return null

  return (
    <div className={embedded ? 'biblioteca-editor__savebar space-y-2' : 'sticky bottom-0 -mx-1 px-1 py-3 bg-white/95 backdrop-blur border-t border-neutral-200 space-y-2'}>
      {showErrors && errorCount > 0 && (
        <Alert variant="error">
          Corrige {errorCount} {errorCount === 1 ? 'campo' : 'campos'} marcado{errorCount === 1 ? '' : 's'} antes de guardar.
        </Alert>
      )}
      {conflict && (
        <Alert variant="error">
          <span className="block">{versionConflictMessage(conflict)}</span>
          {onReload && (
            <Button type="button" variant="secondary" className="mt-2" onClick={onReload}>
              Descartar cambios y recargar
            </Button>
          )}
        </Alert>
      )}
      {!conflict && saveError && <Alert variant="error">{saveError}</Alert>}
      {!conflict && saved && !dirty && <Alert variant="success">Ficha guardada. La tienda puede tardar hasta 5 minutos en mostrar los cambios (caché del navegador).</Alert>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500" aria-live="polite">
          {dirty ? 'Hay cambios sin guardar en la ficha pública.' : 'Sin cambios pendientes.'}
          {validation && !embedded && (
            <>
              {' '}· Estado de validación:{' '}
              <strong data-testid="validation-status" className={validation.pending ? 'text-amber-700' : 'text-neutral-600'}>
                {validation.label}
              </strong>
            </>
          )}
        </span>
        {/* Embedded in a page without a <form>: the button runs the same submit handler directly. */}
        <Button
          type={embedded ? 'button' : 'submit'}
          variant={embedded ? 'secondary' : 'primary'}
          loading={saving}
          disabled={!dirty}
          onClick={embedded ? () => handleSubmit({ preventDefault: () => undefined }) : undefined}
        >
          Guardar ficha pública
        </Button>
      </div>
      {/* CAT-03 regla 5: editar deja la validación PENDIENTE; no la autoriza. */}
      {!embedded && validation?.pending && <Alert variant="warning">{PENDING_VALIDATION_NOTICE}</Alert>}
    </div>
  )
}
