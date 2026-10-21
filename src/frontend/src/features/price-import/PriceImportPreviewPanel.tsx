import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { createRevisionIdempotencyKey, downloadPriceTemplate, previewPriceImport, savePriceRevision, saveTemplateDownload, type PriceImportPreview, type PriceTemplateMode } from '../../services/price-import.service'
import { createPreviewRequestGate, validatePreviewFile } from './preview.utils'
import PriceImportPreviewResults from './PriceImportPreviewResults'
import PriceImportRevisionsSection from './PriceImportRevisionsSection'
import ExportListaSection from './ExportListaSection'
import ProviderProfilesSection from './ProviderProfilesSection'
import { canSaveRevisions } from './revisions.utils'

/** A list change remounts the form, so neither a selected file nor its results carry over. */
export default function PriceImportPreviewPanel({ listaId }: { listaId: string }) {
  const [refreshToken, setRefreshToken] = useState(0)
  return (
    <div className="min-w-0 space-y-5">
      <ExportListaSection listaId={listaId} />
      <PreviewForm key={listaId} listaId={listaId} onRevisionSaved={() => setRefreshToken((token) => token + 1)} />
      <PriceImportRevisionsSection key={`revisions-${listaId}`} listaId={listaId} refreshToken={refreshToken} />
      <ProviderProfilesSection />
    </div>
  )
}

function PreviewForm({ listaId, onRevisionSaved }: { listaId: string; onRevisionSaved?: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<PriceImportPreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const gate = useRef(createPreviewRequestGate()).current
  // Clave de idempotencia: una por archivo; doble clic/reenvío no duplica la revisión.
  const idempotencyKey = useRef(createRevisionIdempotencyKey())

  useEffect(() => () => gate.invalidate(), [gate])

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    gate.invalidate()
    const next = event.target.files?.[0] ?? null
    const fileError = validatePreviewFile(next)
    setFile(fileError ? null : next)
    setResult(null)
    setLoading(false)
    setError('')
    setSaveMessage('')
    setSaveError('')
    idempotencyKey.current = createRevisionIdempotencyKey()
  }

  async function review(event: FormEvent) {
    event.preventDefault()
    if (!file || !listaId) return
    const request = gate.begin()
    setResult(null)
    setError('')
    setSaveMessage('')
    setSaveError('')
    setLoading(true)
    try {
      const response = await previewPriceImport(listaId, file, request.signal)
      if (gate.isCurrent(request.sequence)) setResult(response)
    } catch (cause) {
      if (gate.isCurrent(request.sequence)) setError(getApiErrorMessage(cause, 'No pudimos revisar el archivo. Inténtalo de nuevo.'))
    } finally {
      if (gate.isCurrent(request.sequence)) setLoading(false)
    }
  }

  async function saveRevision() {
    if (!file || !listaId) return
    setSaving(true)
    setSaveError('')
    setSaveMessage('')
    try {
      const header = await savePriceRevision(listaId, file, idempotencyKey.current)
      setSaveMessage(
        header.appliedResult
          ? 'Revisión guardada (ya estaba aplicada).'
          : 'Revisión guardada. Puedes aplicarla cuando quieras desde el historial.',
      )
      onRevisionSaved?.()
    } catch (cause) {
      setSaveError(getApiErrorMessage(cause, 'No pudimos guardar la revisión.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="min-w-0 space-y-5" aria-label="Revisión de precios">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-security-800">Revisar plantilla de precios</h2>
        <p className="mt-2 text-sm text-neutral-600">Sube el Excel con la hoja PRECIOS. Revisaremos las referencias y compararemos los precios con los de esta lista.</p>
        <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Esta revisión no cambia ningún precio ni publica productos. Los precios incluyen IVA y se redondean a pesos enteros.</p>
        <form onSubmit={review} className="mt-5 space-y-3" aria-busy={loading}>
          <label htmlFor="price-preview-file" className="block text-sm font-medium text-neutral-700">Plantilla de precios (.xlsx)</label>
          <input id="price-preview-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2" />
          <p className="text-xs text-neutral-500">Máximo 5 MB y 5000 filas de productos por archivo.</p>
          <p className="text-xs text-neutral-500">Las celdas vacías conservan el precio actual. Las referencias deben existir y pertenecer a esta lista.</p>
          <Button type="submit" loading={loading} disabled={!file || !listaId}>{loading ? 'Revisando…' : 'Revisar archivo'}</Button>
          {loading && <p role="status" className="text-sm text-neutral-600">Estamos comprobando el archivo. Puedes elegir otro para cancelar esta revisión.</p>}
        </form>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
      {result && <PriceImportPreviewResults result={result} />}
      {result && canSaveRevisions() && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6" aria-label="Guardar revisión">
          <h2 className="text-lg font-semibold text-security-800">Guardar esta revisión</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Guarda el archivo y el resultado para recuperarlos más tarde. No cambia ningún precio:
            aplicarla es una acción aparte.
          </p>
          <Button type="button" className="mt-4" loading={saving} disabled={saving} onClick={saveRevision}>
            {saving ? 'Guardando…' : 'Guardar revisión'}
          </Button>
          {saveMessage && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{saveMessage}</p>}
          {saveError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
        </div>
      )}
      <DownloadTemplateSection listaId={listaId} />
    </section>
  )
}

/** IMP-02 §3 — descarga de plantilla NUEVA (vacía o con referencias de esta lista). */
function DownloadTemplateSection({ listaId }: { listaId: string }) {
  const [mode, setMode] = useState<PriceTemplateMode>('vacias')
  const [tariffs, setTariffs] = useState<string[]>([
    'INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA',
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function toggleTariff(code: string) {
    setTariffs((current) => current.includes(code) ? current.filter((t) => t !== code) : [...current, code])
  }

  async function download() {
    setBusy(true)
    setError('')
    try {
      const { blob, fileName } = await downloadPriceTemplate(listaId, mode, mode === 'referencias' ? tariffs : undefined)
      saveTemplateDownload(blob, fileName)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos generar la plantilla. Inténtalo de nuevo.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6" aria-label="Descargar plantilla">
      <h2 className="text-lg font-semibold text-security-800">Descargar plantilla</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Genera un archivo nuevo con las hojas PRECIOS e INSTRUCCIONES. No se sobrescriben tus archivos anteriores.
      </p>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium text-neutral-700">Contenido</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tpl-mode" checked={mode === 'vacias'} onChange={() => setMode('vacias')} />
          Vacía (solo encabezados)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tpl-mode" checked={mode === 'referencias'} onChange={() => setMode('referencias')} />
          Con referencias de esta lista
        </label>
      </fieldset>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium text-neutral-700">Tarifas (columnas IVA)</legend>
        {(['INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA'] as const).map((code) => (
          <label key={code} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tariffs.includes(code)} onChange={() => toggleTariff(code)} />
            {code}
          </label>
        ))}
      </fieldset>
      <Button type="button" className="mt-4" loading={busy} disabled={busy || tariffs.length === 0} onClick={download}>
        Descargar plantilla
      </Button>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  )
}
