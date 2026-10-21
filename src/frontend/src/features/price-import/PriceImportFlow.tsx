import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  applyPriceRevision, createRevisionIdempotencyKey, listUnknownReferences, previewPriceFile, resolveUnknownReferences,
  savePriceFileRevision, type PriceImportPreview, type PriceImportRevisionApplyResult, type PriceImportRevisionHeader,
  type UnknownReferencesView,
} from '../../services/price-import.service'
import { applyRequirements, canApply, FLOW_STEPS } from './flow.utils'
import { createPreviewRequestGate, validatePreviewFile } from './preview.utils'
import PriceImportPreviewResults from './PriceImportPreviewResults'
import { canApplyRevisions, canSaveRevisions } from './revisions.utils'

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
  const gate = useRef(createPreviewRequestGate()).current
  const idempotencyKey = useRef(createRevisionIdempotencyKey())

  useEffect(() => () => gate.invalidate(), [gate])

  function reset() {
    gate.invalidate()
    setStep(1); setFile(null); setPreview(null); setRevision(null); setApplied(null); setUnknown(null)
    setError(''); setConfirmedRejected(false); setConfirmedLarge(false)
    idempotencyKey.current = createRevisionIdempotencyKey()
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    const fileError = validatePreviewFile(next)
    setFile(fileError ? null : next)
    setError(fileError)
  }

  async function review() {
    if (!file) return
    const request = gate.begin()
    setBusy(true); setError('')
    try {
      const response = await previewPriceFile(file, request.signal)
      if (!gate.isCurrent(request.sequence)) return
      setPreview(response)
      setStep(2)
    } catch (cause) {
      if (gate.isCurrent(request.sequence)) setError(getApiErrorMessage(cause, 'No pudimos revisar el archivo. Inténtalo de nuevo.'))
    } finally {
      if (gate.isCurrent(request.sequence)) setBusy(false)
    }
  }

  async function saveAndContinue() {
    if (!file) return
    setBusy(true); setError('')
    try {
      setRevision(await savePriceFileRevision(file, idempotencyKey.current))
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

  return (
    <section className="min-w-0 space-y-5" aria-label="Importar precios">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos">
        {FLOW_STEPS.map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${step === index + 1 ? 'border-[var(--color-primary)] font-semibold text-[var(--color-primary)]' : 'border-neutral-200 text-neutral-500'}`}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {step === 1 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-security-800">Sube la plantilla de precios</h2>
          <p className="mt-2 text-sm text-neutral-600">Usa la plantilla oficial de Grupo Security. Cada referencia actualiza el producto que ya existe en su propia lista; no hace falta elegir una lista.</p>
          <p className="mt-2 text-sm text-neutral-600">Los precios incluyen IVA y se redondean a pesos enteros. Una celda vacía conserva el precio actual.</p>
          <label htmlFor="price-flow-file" className="mt-4 block text-sm font-medium text-neutral-700">Plantilla (.xlsx)</label>
          <input id="price-flow-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile} className="mt-1 block w-full min-w-0 text-sm" />
          <Button className="mt-4" loading={busy} disabled={!file || busy} onClick={review}>{busy ? 'Revisando…' : 'Revisar archivo'}</Button>
        </div>
      )}

      {step === 2 && preview && req && (
        <div className="space-y-4">
          <PriceImportPreviewResults result={preview} />
          {req.largeChangePrices > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {req.largeChangePrices} precio(s) cambian más de {preview.summary.largeChangeThresholdPct ?? 30} %. Tendrás que confirmarlos antes de aplicar.
            </p>
          )}
          {req.rejectedRows > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {req.rejectedRows} fila(s) se rechazan y no se aplicarán (por ejemplo, referencias desconocidas o de listas sin permiso). Las demás sí.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={reset}>Elegir otro archivo</Button>
            {canSaveRevisions() && <Button loading={busy} disabled={busy || req.validRows === 0} onClick={saveAndContinue}>Continuar</Button>}
          </div>
          {req.validRows === 0 && <p className="text-sm text-neutral-600">No hay filas correctas que aplicar. Corrige el archivo y súbelo de nuevo.</p>}
        </div>
      )}

      {step === 3 && preview && req && !applied && (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-security-800">Aplicar precios</h2>
          <p className="text-sm text-neutral-600">Se aplicarán {req.validRows} fila(s) correctas de {preview.fileName}. Si algo falla, no se cambia ningún precio.</p>
          {req.rejectedRows > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmedRejected} onChange={(e) => setConfirmedRejected(e.target.checked)} className="mt-1" />
              Entiendo que {req.rejectedRows} fila(s) rechazada(s) quedan sin aplicar.
            </label>
          )}
          {req.largeChangePrices > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmedLarge} onChange={(e) => setConfirmedLarge(e.target.checked)} className="mt-1" />
              Confirmo los {req.largeChangePrices} cambio(s) de precio mayores al {preview.summary.largeChangeThresholdPct ?? 30} %.
            </label>
          )}
          {canApplyRevisions()
            ? <Button loading={busy} disabled={busy || !canApply(req, confirmedRejected, confirmedLarge)} onClick={apply}>Aplicar precios</Button>
            : <p className="text-sm text-neutral-600">Tu usuario puede revisar y guardar, pero aplicar requiere otro permiso. La revisión queda guardada en el historial.</p>}
        </div>
      )}

      {applied && (
        <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-4 sm:p-6" role="status">
          <h2 className="text-lg font-semibold text-green-900">Precios aplicados</h2>
          <p className="text-sm text-green-900">{applied.appliedPrices} precio(s) en {applied.appliedRows} fila(s). {applied.rejectedRows ? `${applied.rejectedRows} fila(s) rechazada(s) sin aplicar.` : ''}</p>
          {unknown && unknown.items.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-800">
              <p className="font-semibold">Referencias desconocidas ({unknown.total})</p>
              <p className="mt-1 text-neutral-600">{unknown.canCreate ? 'Puedes omitirlas aquí. Crear el borrador "pendiente de ficha" se hace desde Biblioteca.' : 'Solo quien tiene permiso de Biblioteca puede crearlas.'}</p>
              <ul className="mt-2 space-y-1">
                {unknown.items.map((item) => (
                  <li key={item.rowNumber} className="flex items-center justify-between gap-2">
                    <span className="font-mono">Fila {item.rowNumber}: {item.sku}</span>
                    <Button variant="secondary" disabled={busy} onClick={() => skipUnknown(item.rowNumber)}>Omitir</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="secondary" onClick={reset}>Importar otro archivo</Button>
        </div>
      )}
    </section>
  )
}
