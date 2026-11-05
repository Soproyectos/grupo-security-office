import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  applyPriceRevision, createRevisionIdempotencyKey, downloadOfficialPriceTemplate, downloadSinglePriceTemplate, listUnknownReferences, previewPriceFile, resolveUnknownReferences,
  saveTemplateDownload, savePriceFileRevision, type PriceImportPreview, type PriceImportRevisionApplyResult, type PriceImportRevisionHeader,
  type UnknownReferencesView,
} from '../../services/price-import.service'
import {
  applyRequirements, canApply, FLOW_STEPS, isSinglePriceSelectionValid, needsNewIdempotencyKey, normalizeSinglePriceSelection, PRICE_APPLY_INVALIDATE_KEYS,
  singlePriceSelectionToSend, toggleSinglePriceTariff,
} from './flow.utils'
import { createPreviewRequestGate, validatePreviewFile } from './preview.utils'
import PriceImportPreviewResults from './PriceImportPreviewResults'
import PriceReviewIssues from './PriceReviewIssues'
import { canApplyRevisions, canSaveRevisions } from './revisions.utils'
import { buildProblemsCsv, groupReviewIssues, problemsCsvFileName, type ReviewIssueGroup } from './review-issues.utils'
import SinglePriceSelector from './SinglePriceSelector'

const noticeClass = 'rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg-subtle)] p-3 text-sm text-[var(--color-text-primary)]'
const panelClass = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4'
const touch = 'min-h-[44px] sm:min-h-0'

/** Single-template price import: Plantilla → Revisar → Aplicar. No lista is chosen; rows are matched by SKU. */
export default function PriceImportFlow() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PriceImportPreview | null>(null)
  const [revision, setRevision] = useState<PriceImportRevisionHeader | null>(null)
  const [applied, setApplied] = useState<PriceImportRevisionApplyResult | null>(null)
  const [unknown, setUnknown] = useState<UnknownReferencesView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmedRejected, setConfirmedRejected] = useState(false)
  const [confirmedLarge, setConfirmedLarge] = useState(false)
  const [selection, setSelection] = useState<string[]>([])
  const queryClient = useQueryClient()
  const gate = useRef(createPreviewRequestGate()).current
  const idempotencyKey = useRef(createRevisionIdempotencyKey())

  useEffect(() => () => gate.invalidate(), [gate])

  function reset() {
    gate.invalidate()
    setStep(1); setFile(null); setPreview(null); setRevision(null); setApplied(null); setUnknown(null)
    setError(''); setConfirmedRejected(false); setConfirmedLarge(false); setSelection([])
    idempotencyKey.current = createRevisionIdempotencyKey()
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    const fileError = validatePreviewFile(next)
    setFile(fileError ? null : next)
    setError(fileError)
  }

  async function downloadTemplate() {
    setBusy(true); setError('')
    try {
      const { blob, fileName } = await downloadOfficialPriceTemplate()
      saveTemplateDownload(blob, fileName)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos generar la plantilla. Inténtalo de nuevo.'))
    } finally {
      setBusy(false)
    }
  }

  async function downloadSingleTemplate() {
    setBusy(true); setError('')
    try {
      const { blob, fileName } = await downloadSinglePriceTemplate()
      saveTemplateDownload(blob, fileName)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos generar la plantilla. Inténtalo de nuevo.'))
    } finally {
      setBusy(false)
    }
  }

  function downloadProblems(groups: ReviewIssueGroup[]) {
    if (!preview) return
    const blob = new Blob([buildProblemsCsv(groups)], { type: 'text/csv;charset=utf-8' })
    saveTemplateDownload(blob, problemsCsvFileName(preview.fileName))
  }

  /** `chosen` is only sent for single-price files; the first preview sends none (server default: all five). */
  async function review(chosen?: string[]) {
    if (!file) return
    const request = gate.begin()
    setBusy(true); setError('')
    try {
      const response = await previewPriceFile(file, chosen, request.signal)
      if (!gate.isCurrent(request.sequence)) return
      setPreview(response)
      if (response.singlePrice) setSelection(normalizeSinglePriceSelection(response.singlePrice.tariffs))
      else setSelection([])
      if (chosen) idempotencyKey.current = createRevisionIdempotencyKey()
      setStep(2)
    } catch (cause) {
      if (gate.isCurrent(request.sequence)) setError(getApiErrorMessage(cause, 'No pudimos revisar el archivo. Inténtalo de nuevo.'))
      if (gate.isCurrent(request.sequence) && chosen && preview?.singlePrice) setSelection(normalizeSinglePriceSelection(preview.singlePrice.tariffs))
    } finally {
      if (gate.isCurrent(request.sequence)) setBusy(false)
    }
  }

  function changeSelection(code: string, checked: boolean) {
    const next = toggleSinglePriceTariff(selection, code, checked)
    const previous = selection
    setSelection(next)
    if (!isSinglePriceSelectionValid(next) || !needsNewIdempotencyKey(previous, next)) return
    void review(next)
  }

  async function saveAndContinue() {
    if (!file) return
    if (preview?.singlePrice && !isSinglePriceSelectionValid(selection)) return
    setBusy(true); setError('')
    try {
      setRevision(await savePriceFileRevision(file, idempotencyKey.current, singlePriceSelectionToSend(preview, selection)))
      setStep(3)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos guardar la revisión.'))
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!revision || !preview) return
    const req = applyRequirements(preview.summary)
    setBusy(true); setError('')
    try {
      const result = await applyPriceRevision(revision.id, {
        acknowledgeRejectedRows: req.rejectedRows > 0 ? req.rejectedRows : undefined,
        confirmLargeChanges: req.largeChangePrices > 0 ? true : undefined,
      })
      setApplied(result)
      for (const queryKey of PRICE_APPLY_INVALIDATE_KEYS) void queryClient.invalidateQueries({ queryKey: [...queryKey], refetchType: 'all' })
      if ((preview.summary.unknownRows ?? 0) > 0) setUnknown(await listUnknownReferences(revision.id).catch(() => null))
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos aplicar los precios. No se cambió nada.'))
    } finally {
      setBusy(false)
    }
  }

  async function skipUnknown(rowNumber: number) {
    if (!revision || !unknown) return
    setBusy(true); setError('')
    try {
      await resolveUnknownReferences(revision.id, [{ rowNumber, action: 'SKIP' }])
      setUnknown({ ...unknown, items: unknown.items.filter((i) => i.rowNumber !== rowNumber), total: unknown.total - 1 })
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos omitir la referencia.'))
    } finally {
      setBusy(false)
    }
  }

  const req = preview ? applyRequirements(preview.summary) : null
  const issueGroups = preview ? groupReviewIssues(preview) : []

  return (
    <section className="min-w-0 space-y-3" aria-label="Importar precios">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos">
        {FLOW_STEPS.map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${step === index + 1 ? 'border-[var(--color-primary)] font-semibold text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="rounded-lg border border-[var(--color-error)] bg-[var(--color-error-bg-subtle)] p-3 text-sm text-[var(--color-text-primary)]">{error}</p>}

      {step === 1 && (
        <div className={`grid gap-x-8 gap-y-5 md:grid-cols-2 ${panelClass}`}>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Descarga la plantilla</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Escribe la referencia y el precio de cada tarifa. Los precios incluyen IVA y se redondean a pesos enteros. Una celda vacía conserva el precio actual.</p>
            <Button className={`mt-3 ${touch}`} disabled={busy} onClick={downloadTemplate}>Descargar plantilla</Button>
            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
              <Button variant="secondary" className={`text-left ${touch}`} disabled={busy} onClick={downloadSingleTemplate}>Proveedor con un solo precio: descargar plantilla de precio único</Button>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Ese precio se copia a las tarifas que elijas al revisar el archivo.</p>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Sube el archivo</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Cada referencia actualiza el producto que ya existe en Biblioteca. Antes de aplicar, verás qué cambia y qué problemas hay.</p>
            <label htmlFor="price-flow-file" className="mt-3 block text-sm font-medium text-[var(--color-text-primary)]">Plantilla (.xlsx)</label>
            <input id="price-flow-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile}
              className={`mt-1 block w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${touch}`} />
            <Button className={`mt-3 ${touch}`} loading={busy} disabled={!file || busy} onClick={() => review()}>{busy ? 'Revisando…' : 'Revisar archivo'}</Button>
          </div>
        </div>
      )}

      {step === 2 && preview && req && (
        <div className="space-y-3">
          {preview.singlePrice && <SinglePriceSelector selected={selection} disabled={busy} onChange={changeSelection} />}
          <PriceImportPreviewResults
            result={preview}
            hideProblemDetails
            beforeTable={issueGroups.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Problemas encontrados</h3>
                  <Button variant="secondary" className={touch} onClick={() => downloadProblems(issueGroups)}>Descargar problemas (CSV)</Button>
                </div>
                <PriceReviewIssues groups={issueGroups} />
              </div>
            )}
          />
          {req.largeChangePrices > 0 && (
            <p className={noticeClass}>{req.largeChangePrices} precio(s) cambian más de {preview.summary.largeChangeThresholdPct ?? 30} %. Tendrás que confirmarlos antes de aplicar.</p>
          )}
          {req.rejectedRows > 0 && (
            <p className={noticeClass}>{req.rejectedRows} fila(s) se rechazan y no se aplicarán (por ejemplo, referencias que no están en Biblioteca o sin permiso). Las demás sí.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className={touch} onClick={reset}>Elegir otro archivo</Button>
            {canSaveRevisions() && <Button className={touch} loading={busy} disabled={busy || req.validRows === 0 || (!!preview.singlePrice && !isSinglePriceSelectionValid(selection))} onClick={saveAndContinue}>Continuar</Button>}
          </div>
          {req.validRows === 0 && <p className="text-sm text-[var(--color-text-secondary)]">No hay filas correctas que aplicar. Corrige el archivo y súbelo de nuevo.</p>}
        </div>
      )}

      {step === 3 && preview && req && !applied && (
        <div className={`space-y-3 ${panelClass}`}>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Aplicar precios</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Se aplicarán {req.validRows} fila(s) correctas de {preview.fileName}. Si algo falla, no se cambia ningún precio.</p>
          {req.rejectedRows > 0 && (
            <label className={`flex items-start gap-2 text-sm ${touch}`}>
              <input type="checkbox" checked={confirmedRejected} onChange={(e) => setConfirmedRejected(e.target.checked)} className="mt-1 h-4 w-4" />
              Entiendo que {req.rejectedRows} fila(s) rechazada(s) quedan sin aplicar.
            </label>
          )}
          {req.largeChangePrices > 0 && (
            <label className={`flex items-start gap-2 text-sm ${touch}`}>
              <input type="checkbox" checked={confirmedLarge} onChange={(e) => setConfirmedLarge(e.target.checked)} className="mt-1 h-4 w-4" />
              Confirmo los {req.largeChangePrices} cambio(s) de precio mayores al {preview.summary.largeChangeThresholdPct ?? 30} %.
            </label>
          )}
          {canApplyRevisions()
            ? <Button className={touch} loading={busy} disabled={busy || !canApply(req, confirmedRejected, confirmedLarge)} onClick={apply}>Aplicar precios</Button>
            : <p className="text-sm text-[var(--color-text-secondary)]">Tu cuenta puede revisar y guardar, pero no aplicar precios. Pide a un administrador que aplique esta revisión guardada.</p>}
        </div>
      )}

      {applied && (
        <div className="space-y-3 rounded-xl border border-[var(--color-success)] bg-[var(--color-success-bg-subtle)] p-4" role="status">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Precios aplicados</h2>
          <p className="text-sm text-[var(--color-text-primary)]">
            Se actualizaron {applied.appliedPrices} precio(s) en {applied.appliedRows} producto(s).
            {applied.rejectedRows ? ` ${applied.rejectedRows} fila(s) quedaron sin aplicar.` : ''}
          </p>
          {unknown && unknown.items.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 text-sm text-[var(--color-text-primary)]">
              <p className="font-semibold">Referencias que no están en Biblioteca ({unknown.total})</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">{unknown.canCreate ? 'Estas filas no se aplicaron. Puedes omitirlas aquí; para dar de alta el producto, créalo desde Biblioteca.' : 'Estas filas no se aplicaron. Solo quien administra Biblioteca puede crear productos nuevos.'}</p>
              <ul className="mt-2 space-y-1">
                {unknown.items.map((item) => (
                  <li key={item.rowNumber} className="flex items-center justify-between gap-2">
                    <span className="font-mono">Fila {item.rowNumber}: {item.sku}</span>
                    <Button variant="secondary" className={touch} disabled={busy} onClick={() => skipUnknown(item.rowNumber)}>Omitir</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link to="/commercial/products" className={`inline-flex items-center justify-center rounded-lg bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] sm:py-2.5 ${touch}`}>Ver productos</Link>
            <Button variant="secondary" className={touch} onClick={reset}>Importar otro archivo</Button>
          </div>
        </div>
      )}
    </section>
  )
}
