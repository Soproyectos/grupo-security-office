import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  downloadBatchResults, downloadExample, downloadTemplate, executeTemplate, listBatches, previewTemplate, saveMappings,
} from './template-import.api'
import {
  buildConfirmUnresolved, canConfirmImport, conflictNotice, friendlyImportError, isAcceptedFileName,
  toggleAllSkus, toggleSku, upsertResolution, type FriendlyError, type PreviewTabKey, type WizardStage,
} from './template-import.helpers'
import { followBatch } from './template-import.polling'
import type { BatchResults, BatchSummary, MappingIncident, TemplatePreview } from './template-import.types'
import { HistoryView, PreviewStep, ProgressStep, ResolveStep, ResultView, Stepper, TemplateStep, UploadStep, ErrorBox } from './TemplateImportViews'

/**
 * Follows one batch: polls its progress (bounded) and loads the results when it finishes.
 * Unmounting only stops the polling; the batch keeps running on the server.
 */
export function BatchViewer({ batchId, onStage, onFinished, onRestart }: { batchId: string; onStage?: (stage: WizardStage) => void; onFinished?: () => void; onRestart?: () => void }) {
  const [batch, setBatch] = useState<BatchSummary | null>(null)
  const [results, setResults] = useState<BatchResults | null>(null)
  const [error, setError] = useState<FriendlyError | null>(null)
  const [stopped, setStopped] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    setBatch(null); setResults(null); setError(null); setStopped(false)
    onStage?.('progress')
    return followBatch(batchId, {
      onProgress: setBatch,
      onResult: (loaded) => { setResults(loaded); onStage?.('result'); onFinished?.() },
      onStopped: () => setStopped(true),
      onError: (cause) => setError(friendlyImportError(cause)),
    })
    // onStage/onFinished are intentionally not dependencies: only a different batch restarts the follow-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId])

  if (error) return <ErrorBox message={error.message} details={error.details} />
  if (results) {
    return <ResultView results={results} downloadError={downloadError} onRestart={onRestart}
      onDownload={(format) => { setDownloadError(null); downloadBatchResults(batchId, format).catch((cause) => setDownloadError(friendlyImportError(cause).message)) }} />
  }
  return <ProgressStep batch={batch} stopped={stopped} />
}

export function TemplateImportWizard({ canRun }: { canRun: boolean }) {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<WizardStage>('template')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<TemplatePreview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [tab, setTab] = useState<PreviewTabKey>('creates')
  const [batchId, setBatchId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const confirming = useRef(false)

  const pick = (next: File | null) => {
    if (next && !isAcceptedFileName(next.name)) { setError({ message: 'Solo se aceptan archivos Excel (.xlsx) de la plantilla.', details: [] }); return }
    setError(null); setFile(next)
  }

  const download = async (action: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await action() } catch (cause) { setError(friendlyImportError(cause)) } finally { setBusy(false) }
  }

  const validate = async () => {
    if (!file || !canRun) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const next = await previewTemplate(file)
      setPreview(next); setSelected([]); setTab('creates')
      setStage(next.mappingIncidents.length > 0 ? 'resolve' : 'preview')
    } catch (cause) {
      setError(friendlyImportError(cause))
    } finally { setBusy(false) }
  }

  const choose = async (incident: MappingIncident, targetId: string | null) => {
    if (!preview) return
    const resolutions = upsertResolution(preview.resolutions, { kind: incident.kind, sourceText: incident.sourceText, targetId })
    setBusy(true); setNotice(null)
    try {
      const next = await saveMappings(preview.previewId, resolutions)
      setPreview(next)
      setSelected((current) => buildConfirmUnresolved(current, next))
    } catch (cause) {
      setNotice(conflictNotice(cause) ?? friendlyImportError(cause).message)
    } finally { setBusy(false) }
  }

  const confirm = async () => {
    if (confirming.current || !preview || !canConfirmImport({ canRun, busy, preview })) return
    confirming.current = true
    setBusy(true); setError(null)
    try {
      const started = await executeTemplate(preview.previewId, buildConfirmUnresolved(selected, preview))
      setBatchId(started.batchId)
      setStage('progress')
    } catch (cause) {
      setError(friendlyImportError(cause))
    } finally { confirming.current = false; setBusy(false) }
  }

  const refreshCatalog = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['brands'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
    ])
  }, [queryClient])

  const restart = () => { setStage('template'); setFile(null); setPreview(null); setSelected([]); setBatchId(null); setError(null); setNotice(null) }

  return (
    <div className="space-y-4">
      <Stepper stage={stage} />
      <input ref={input} type="file" accept=".xlsx" className="hidden" aria-label="Archivo Excel de la plantilla" onChange={(event) => { pick(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = '' }} />
      {stage === 'template' && <TemplateStep busy={busy} onDownloadTemplate={() => void download(downloadTemplate)} onDownloadExample={() => void download(downloadExample)} onNext={() => setStage('upload')} />}
      {stage === 'template' && error && <ErrorBox message={error.message} details={error.details} />}
      {stage === 'upload' && <UploadStep file={file} busy={busy} dragging={dragging} error={error} onPick={() => input.current?.click()} onValidate={() => void validate()} onBack={() => setStage('template')} onDragState={setDragging} onDropFile={pick} />}
      {stage === 'resolve' && preview && <ResolveStep preview={preview} canRun={canRun} busy={busy} selectedSkus={selected} notice={notice}
        onChoose={(incident, target) => void choose(incident, target)} onToggleSku={(sku) => setSelected((c) => toggleSku(c, sku))} onToggleAll={() => setSelected((c) => toggleAllSkus(preview, c))}
        onBack={() => setStage('upload')} onNext={() => setStage('preview')} />}
      {stage === 'preview' && preview && <PreviewStep preview={preview} activeTab={tab} canRun={canRun} busy={busy} canConfirm={canConfirmImport({ canRun, busy, preview })}
        selectedCount={buildConfirmUnresolved(selected, preview).length} error={error} onTab={setTab}
        onBack={() => setStage(preview.mappingIncidents.length > 0 ? 'resolve' : 'upload')} onConfirm={() => void confirm()} />}
      {(stage === 'progress' || stage === 'result') && batchId && <BatchViewer batchId={batchId} onStage={setStage} onFinished={refreshCatalog} onRestart={restart} />}
    </div>
  )
}

const PAGE_SIZE = 20

export function TemplateImportHistory() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: BatchSummary[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openBatch, setOpenBatch] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    listBatches(page, PAGE_SIZE)
      .then((result) => { if (!cancelled) setData({ items: result.items, total: result.total }) })
      .catch((cause) => { if (!cancelled) setError(friendlyImportError(cause).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page])

  return (
    <HistoryView items={data.items} total={data.total} page={page} pageSize={PAGE_SIZE} loading={loading} error={error} onOpen={setOpenBatch} onPage={setPage}>
      {openBatch && <BatchViewer batchId={openBatch} />}
    </HistoryView>
  )
}
