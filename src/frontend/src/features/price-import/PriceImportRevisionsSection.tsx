import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatDate } from '../../lib/format'
import {
  applyPriceRevision,
  discardPriceRevision,
  downloadPriceRevisionFile,
  getPriceRevision,
  listPriceRevisions,
  saveTemplateDownload,
  type PriceImportRevisionDetail,
  type PriceImportRevisionHeader,
} from '../../services/price-import.service'
import { applyNotice, canApplyRevisions, canReadRevisions, canSaveRevisions, conflictFeedback, revisionStatusLabel } from './revisions.utils'

export default function PriceImportRevisionsSection({
  listaId,
  refreshToken = 0,
}: {
  listaId: string
  refreshToken?: number
}) {
  const [items, setItems] = useState<PriceImportRevisionHeader[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PriceImportRevisionDetail | null>(null)
  const [detailError, setDetailError] = useState('')

  const reload = useCallback(async () => {
    if (!canReadRevisions()) return
    setLoading(true)
    setError('')
    try {
      const page = await listPriceRevisions(listaId, 1, 25)
      setItems(page.items)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos cargar el historial de revisiones.'))
    } finally {
      setLoading(false)
    }
  }, [listaId])

  useEffect(() => {
    void reload()
  }, [reload, refreshToken])

  async function toggleRows(id: string) {
    setDetailError('')
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(id)
    setDetail(null)
    try {
      setDetail(await getPriceRevision(id, 1, 100))
    } catch (cause) {
      setDetailError(getApiErrorMessage(cause, 'No pudimos abrir la revisión.'))
    }
  }

  async function apply(item: PriceImportRevisionHeader) {
    setBusyId(item.id)
    setError('')
    setNotice('')
    setConflict([])
    try {
      const result = await applyPriceRevision(item.id)
      setNotice(applyNotice(result))
      await reload()
    } catch (cause) {
      const feedback = conflictFeedback(cause)
      setConflict(feedback)
      setError(getApiErrorMessage(cause, 'No pudimos aplicar la revisión.'))
    } finally {
      setBusyId(null)
    }
  }

  async function download(item: PriceImportRevisionHeader) {
    setError('')
    try {
      const { blob, fileName } = await downloadPriceRevisionFile(item.id)
      saveTemplateDownload(blob, fileName)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos descargar el archivo de la revisión.'))
    }
  }

  async function discard(item: PriceImportRevisionHeader) {
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      await discardPriceRevision(item.id)
      await reload()
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos descartar la revisión.'))
    } finally {
      setBusyId(null)
    }
  }

  if (!canReadRevisions()) return null

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6" aria-label="Historial de revisiones">
      <h2 className="text-lg font-semibold text-security-800">Revisiones guardadas</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Revisar y aplicar son permisos distintos: puedes dejar una revisión lista para que otra persona la aplique.
      </p>
      {notice && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {conflict.length > 0 && (
        <ul role="alert" className="mt-3 list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-6 text-sm text-amber-900">
          {conflict.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      )}
      {loading && <p role="status" className="mt-3 text-sm text-neutral-600">Cargando historial…</p>}
      {!loading && items.length === 0 && <p className="mt-3 text-sm text-neutral-500">Todavía no hay revisiones guardadas para esta lista.</p>}

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-800">{item.fileName}</p>
                <p className="text-xs text-neutral-500">
                  {revisionStatusLabel(item.status)} · {formatDate(item.createdAt)} · {item.summary.validRows} fila(s) válida(s)
                  {item.appliedResult ? ` · ${item.appliedResult.appliedPrices} precio(s) aplicados` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => toggleRows(item.id)}>
                  {openId === item.id ? 'Ocultar' : 'Ver filas'}
                </Button>
                {item.fileAvailable && (
                  <Button type="button" variant="ghost" onClick={() => download(item)}>Descargar</Button>
                )}
                {canApplyRevisions() && item.status === 'GUARDADA' && (
                  <Button type="button" loading={busyId === item.id} disabled={busyId === item.id} onClick={() => apply(item)}>
                    Aplicar
                  </Button>
                )}
                {canSaveRevisions() && item.status === 'GUARDADA' && (
                  <Button type="button" variant="ghost" loading={busyId === item.id} disabled={busyId === item.id} onClick={() => discard(item)}>
                    Descartar
                  </Button>
                )}
              </div>
            </div>
            {openId === item.id && (
              <div className="mt-3">
                {detailError && <p role="alert" className="text-sm text-red-800">{detailError}</p>}
                {!detail && !detailError && <p className="text-sm text-neutral-500">Cargando filas…</p>}
                {detail && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-neutral-500">
                          <th className="px-2 py-1">Fila</th><th className="px-2 py-1">Referencia</th>
                          <th className="px-2 py-1">Tarifa</th><th className="px-2 py-1">Recibido</th>
                          <th className="px-2 py-1">Redondeado</th><th className="px-2 py-1">Anterior</th><th className="px-2 py-1">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.rows.flatMap((row) => row.prices.length > 0 ? row.prices.map((price) => (
                          <tr key={`${row.row}-${price.code}`} className="border-t border-neutral-100">
                            <td className="px-2 py-1">{row.row}</td>
                            <td className="px-2 py-1">{row.sku}</td>
                            <td className="px-2 py-1">{price.code}</td>
                            <td className="px-2 py-1">{price.raw}</td>
                            <td className="px-2 py-1">{price.rounded}</td>
                            <td className="px-2 py-1">{price.previous ?? '—'}</td>
                            <td className="px-2 py-1">{row.status === 'valid' ? price.change : 'con problemas'}</td>
                          </tr>
                        )) : [(
                          <tr key={`${row.row}-empty`} className="border-t border-neutral-100">
                            <td className="px-2 py-1">{row.row}</td>
                            <td className="px-2 py-1">{row.sku}</td>
                            <td className="px-2 py-1" colSpan={5}>{row.issues.map((issue) => issue.message).join(' ') || 'con problemas'}</td>
                          </tr>
                        )])}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
