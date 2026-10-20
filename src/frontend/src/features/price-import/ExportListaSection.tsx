import { useState } from 'react'
import { Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { exportListaPrices, saveTemplateDownload } from '../../services/price-import.service'
import { canExportPrices } from './export-prices.utils'

/**
 * IMP-07 (07A) — Exportar las referencias y precios vigentes de esta lista.
 * Archivo NUEVO generado en el servidor; solo incluye datos/tarifas autorizados.
 */
export default function ExportListaSection({ listaId }: { listaId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function exportPrices() {
    setBusy(true)
    setError('')
    try {
      const { blob, fileName } = await exportListaPrices(listaId)
      saveTemplateDownload(blob, fileName)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos exportar los precios de esta lista.'))
    } finally {
      setBusy(false)
    }
  }

  if (!canExportPrices()) return null

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6" aria-label="Exportar precios">
      <h2 className="text-lg font-semibold text-security-800">Exportar precios</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Descarga un archivo con las referencias de esta lista y sus precios vigentes.
        Solo incluye las tarifas que puedes ver; no modifica ningún precio.
      </p>
      <Button type="button" variant="secondary" className="mt-4" loading={busy} disabled={busy} onClick={exportPrices}>
        {busy ? 'Exportando…' : 'Exportar precios (.xlsx)'}
      </Button>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  )
}
