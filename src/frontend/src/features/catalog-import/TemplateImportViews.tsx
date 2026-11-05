import type { ReactNode } from 'react'
import {
  BATCH_STATE_LABELS, PREVIEW_TAB_LABELS, RESULT_STATUS_LABELS, changeLines, countLines, formatDate, groupIncidents, incidentMessage,
  issueLine, mappingChoices, previewTabs, progressPercent, resolutionFor, stepStates, type PreviewTabKey, type WizardStage,
} from './template-import.helpers'
import type {
  BatchResultRow, BatchResults, BatchSummary, MappingIncident, PreviewItem, TemplateIssue, TemplatePreview,
} from './template-import.types'

const card = 'space-y-3 rounded-lg border border-neutral-200 bg-white p-4'
const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50'
export const buttonClasses = { primary: primaryButton, secondary: secondaryButton }

export function Stepper({ stage }: { stage: WizardStage }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Pasos de la importación">
      {stepStates(stage).map((step) => (
        <li key={step.stage} aria-current={step.state === 'current' ? 'step' : undefined} data-state={step.state}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${step.state === 'current' ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] font-semibold text-[var(--color-primary)]' : step.state === 'done' ? 'border-neutral-300 bg-neutral-50 text-neutral-700' : 'border-neutral-200 text-neutral-500'}`}>
          <span aria-hidden="true">{step.state === 'done' ? '✓' : step.number}</span>{step.label}
        </li>
      ))}
    </ol>
  )
}

export function ErrorBox({ message, details }: { message: string; details?: string[] }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p>{message}</p>
      {details && details.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1">{details.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ul>}
    </div>
  )
}

export function TemplateStep({ onDownloadTemplate, onDownloadExample, onNext, busy }: { onDownloadTemplate: () => void; onDownloadExample: () => void; onNext: () => void; busy: boolean }) {
  return (
    <section className={card} aria-labelledby="tpl-step">
      <h3 id="tpl-step" className="text-base font-semibold text-neutral-800">1. Descarga la plantilla</h3>
      <p className="text-sm text-neutral-600">La plantilla es un Excel con una hoja para los productos y otras para sus características, imágenes, documentos y firmware. Llénala y súbela en el siguiente paso.</p>
      <ul className="list-inside list-disc space-y-1 text-sm text-neutral-700">
        <li>Las imágenes, documentos y firmware se indican con un enlace (URL). Una ruta de tu computador, como C:\Fotos\camara.jpg, no sube el archivo.</li>
        <li>Para adjuntar un archivo real, hazlo después desde el editor de cada producto.</li>
        <li>Las celdas vacías nunca borran datos que el producto ya tiene.</li>
        <li>Esta importación no crea marcas, categorías, subcategorías, atributos ni moldes: solo usa los que ya existen.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={busy} onClick={onDownloadTemplate}>Descargar plantilla</button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={onDownloadExample}>Descargar ejemplo lleno</button>
        <button type="button" className={primaryButton} onClick={onNext}>Ya tengo el archivo, continuar</button>
      </div>
    </section>
  )
}

export interface UploadStepProps {
  file: File | null
  busy: boolean
  dragging: boolean
  error: { message: string; details: string[] } | null
  onPick: () => void
  onValidate: () => void
  onBack: () => void
  onDragState: (dragging: boolean) => void
  onDropFile: (file: File | null) => void
}

export function UploadStep(props: UploadStepProps) {
  return (
    <section className={card} aria-labelledby="upload-step">
      <h3 id="upload-step" className="text-base font-semibold text-neutral-800">2. Sube el archivo y revisa su estructura</h3>
      <div
        role="button" tabIndex={0} aria-label="Zona para soltar el archivo Excel"
        onClick={props.onPick}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onPick() } }}
        onDragOver={(event) => { event.preventDefault(); props.onDragState(true) }}
        onDragLeave={() => props.onDragState(false)}
        onDrop={(event) => { event.preventDefault(); props.onDragState(false); props.onDropFile(event.dataTransfer.files?.[0] ?? null) }}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center text-sm ${props.dragging ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)]' : 'border-neutral-300 bg-neutral-50'}`}>
        <span className="font-medium text-neutral-800">{props.file ? props.file.name : 'Arrastra aquí tu Excel o haz clic para elegirlo'}</span>
        <span className="mt-1 text-xs text-neutral-500">Solo archivos .xlsx de la plantilla</span>
      </div>
      {props.error && <ErrorBox message={props.error.message} details={props.error.details} />}
      {props.busy && <p role="status" className="text-sm text-neutral-600">Revisando el archivo…</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={props.busy} onClick={props.onBack}>Volver</button>
        <button type="button" className={primaryButton} disabled={!props.file || props.busy} onClick={props.onValidate}>{props.busy ? 'Revisando…' : 'Validar archivo'}</button>
      </div>
    </section>
  )
}

export interface ResolveStepProps {
  preview: TemplatePreview
  canRun: boolean
  busy: boolean
  selectedSkus: string[]
  notice: string | null
  onChoose: (incident: MappingIncident, targetId: string | null) => void
  onToggleSku: (sku: string) => void
  onToggleAll: () => void
  onBack: () => void
  onNext: () => void
}

function IncidentRow({ incident, preview, disabled, onChoose }: { incident: MappingIncident; preview: TemplatePreview; disabled: boolean; onChoose: ResolveStepProps['onChoose'] }) {
  const choices = mappingChoices(incident.kind, preview.options)
  const value = resolutionFor(preview.resolutions, incident.kind, incident.sourceText) ?? ''
  const id = `map-${incident.kind}-${incident.sourceText}`
  return (
    <li className="space-y-1 rounded-md border border-neutral-200 p-3">
      <p className="text-sm text-neutral-800">{incidentMessage(incident)}</p>
      <label htmlFor={id} className="block text-xs font-medium text-neutral-600">Usar esta opción existente</label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChoose(incident, event.target.value || null)}
        className="block h-11 w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-800">
        <option value="">Sin asociar</option>
        {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </li>
  )
}

export function ResolveStep(props: ResolveStepProps) {
  const groups = groupIncidents(props.preview.mappingIncidents)
  const confirmable = props.preview.creates.filter((item) => item.needsConfirmation)
  const disabled = !props.canRun || props.busy
  return (
    <section className={card} aria-labelledby="resolve-step">
      <h3 id="resolve-step" className="text-base font-semibold text-neutral-800">3. Resuelve lo que no coincide</h3>
      <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">Esta importación no crea marcas, categorías, subcategorías, atributos ni moldes. Solo puedes asociar el texto del archivo con uno que ya exista.</p>
      {props.notice && <ErrorBox message={props.notice} />}
      {groups.length === 0 && <p className="text-sm text-neutral-600">Todo coincide con registros existentes. No hay nada que resolver.</p>}
      {groups.map((group) => (
        <div key={group.kind} className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-700">{group.label}</h4>
          <ul className="space-y-2">{group.items.map((incident) => <IncidentRow key={`${incident.kind}-${incident.code}-${incident.sourceText}`} incident={incident} preview={props.preview} disabled={disabled} onChoose={props.onChoose} />)}</ul>
        </div>
      ))}
      {confirmable.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <h4 className="text-sm font-semibold text-neutral-800">Productos nuevos con datos sin asociar</h4>
          <p className="text-sm text-neutral-700">Si marcas un producto, se agrega como borrador guardando el texto original del archivo y una incidencia para corregirlo después. Los que no marques no se importan.</p>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-neutral-800">
            <input type="checkbox" disabled={disabled} checked={confirmable.length > 0 && confirmable.every((item) => props.selectedSkus.includes(item.sku))} onChange={props.onToggleAll} className="h-4 w-4" />
            Marcar todos ({confirmable.length})
          </label>
          <ul className="space-y-1">
            {confirmable.map((item) => (
              <li key={item.sku}>
                <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-800">
                  <input type="checkbox" disabled={disabled} checked={props.selectedSkus.includes(item.sku)} onChange={() => props.onToggleSku(item.sku)} className="h-4 w-4" />
                  <span><strong>{item.sku}</strong> {item.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!props.canRun && <p className="text-sm text-neutral-600">Tu cuenta solo puede consultar. Para decidir, pide el permiso de importar.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={props.busy} onClick={props.onBack}>Volver</button>
        <button type="button" className={primaryButton} disabled={props.busy} onClick={props.onNext}>Ver vista previa</button>
      </div>
    </section>
  )
}

function ChangeTable({ title, changes, tone }: { title: string; changes: PreviewItem['changes']; tone: 'apply' | 'proposal' }) {
  const lines = changeLines(changes)
  if (lines.length === 0) return null
  return (
    <div>
      <p className={`text-xs font-semibold ${tone === 'proposal' ? 'text-amber-700' : 'text-neutral-600'}`}>{title}</p>
      <table className="mt-1 w-full border-collapse text-left text-xs">
        <thead><tr className="text-neutral-500"><th className="py-1 pr-2">Dato</th><th className="py-1 pr-2">Antes</th><th className="py-1">Después</th></tr></thead>
        <tbody>{lines.map((line, i) => <tr key={`${line.field}-${i}`} className="border-t border-neutral-100 align-top"><td className="py-1 pr-2 font-medium text-neutral-800">{line.label}</td><td className="py-1 pr-2 text-neutral-600">{line.before}</td><td className="py-1 text-neutral-800">{line.after}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export function PreviewRow({ item, tab }: { item: PreviewItem; tab: PreviewTabKey }) {
  return (
    <li className="space-y-2 rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-800">{item.sku || item.reference} <span className="font-normal text-neutral-600">{item.name}</span> <span className="text-xs text-neutral-400">fila {item.row}</span></p>
      {tab === 'creates' && <p className="text-xs text-neutral-600">Se crea como borrador.</p>}
      <ChangeTable title="Se aplicará" changes={item.changes} tone="apply" />
      <ChangeTable title="Propuesta, no se aplica" changes={item.proposals} tone="proposal" />
      {item.protectedBy.length > 0 && <p className="text-xs text-amber-700">Dato protegido: queda como propuesta, no se aplica ({item.protectedBy.join(', ')}).</p>}
      {item.pending.length > 0 && <p className="text-xs text-neutral-600">Queda pendiente: {item.pending.join(', ')}</p>}
      {item.issues.length > 0 && <ul className="list-inside list-disc text-xs text-neutral-700">{item.issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issueLine(issue)}</li>)}</ul>}
    </li>
  )
}

export interface PreviewStepProps {
  preview: TemplatePreview
  activeTab: PreviewTabKey
  canRun: boolean
  canConfirm: boolean
  busy: boolean
  selectedCount: number
  error: { message: string; details: string[] } | null
  onTab: (tab: PreviewTabKey) => void
  onBack: () => void
  onConfirm: () => void
}

export function PreviewStep(props: PreviewStepProps) {
  const tabs = previewTabs(props.preview)
  const active = tabs.find((tab) => tab.key === props.activeTab) ?? tabs[0]!
  return (
    <section className={card} aria-labelledby="preview-step">
      <h3 id="preview-step" className="text-base font-semibold text-neutral-800">4. Revisa antes y después</h3>
      <p className="text-sm text-neutral-600">Aún no se ha guardado nada. Las celdas vacías nunca borran datos, y los productos publicados siguen públicos.</p>
      <div role="tablist" aria-label="Resultado de la revisión" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.key} role="tab" type="button" aria-selected={tab.key === active.key} onClick={() => props.onTab(tab.key)}
            className={`min-h-11 rounded-md border px-3 text-sm ${tab.key === active.key ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] font-semibold' : 'border-neutral-300 bg-white'}`}>{tab.label} ({tab.count})</button>
        ))}
      </div>
      <div role="tabpanel" aria-label={PREVIEW_TAB_LABELS[active.key]} className="max-h-[28rem] overflow-auto">
        {active.rows.length === 0 ? <p className="text-sm text-neutral-500">No hay productos en esta lista.</p> : <ul className="space-y-2">{active.rows.map((item) => <PreviewRow key={`${item.row}-${item.sku}`} item={item} tab={active.key} />)}</ul>}
      </div>
      {props.preview.unassigned.length > 0 && <UnassignedList issues={props.preview.unassigned} />}
      {props.selectedCount > 0 && <p className="text-sm text-neutral-700">Se agregarán {props.selectedCount} {props.selectedCount === 1 ? 'producto marcado' : 'productos marcados'} conservando el texto original.</p>}
      {props.error && <ErrorBox message={props.error.message} details={props.error.details} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={props.busy} onClick={props.onBack}>Volver</button>
        {props.canRun && <button type="button" className={primaryButton} disabled={!props.canConfirm} onClick={props.onConfirm}>{props.busy ? 'Iniciando…' : 'Confirmar e importar'}</button>}
      </div>
      {props.canRun && props.preview.summary.create + props.preview.summary.update + props.preview.summary.proposed === 0 && <p className="text-sm text-neutral-600">No hay nada que importar con este archivo.</p>}
    </section>
  )
}

export function UnassignedList({ issues }: { issues: TemplateIssue[] }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-semibold text-neutral-700">Avisos del archivo que no pertenecen a un producto</p>
      <ul className="mt-1 list-inside list-disc text-xs text-neutral-700">{issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issueLine(issue)}</li>)}</ul>
    </div>
  )
}

export function ProgressBar({ batch }: { batch: Pick<BatchSummary, 'processed' | 'total' | 'state'> }) {
  const percent = batch.total === 0 && batch.state === 'PROCESSING' ? 0 : progressPercent(batch.processed, batch.total)
  return (
    <div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Avance de la importación" className="h-3 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full bg-[var(--color-primary)]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-sm text-neutral-700">{batch.processed} de {batch.total} productos ({percent}%)</p>
    </div>
  )
}

export function ProgressStep({ batch, stopped }: { batch: BatchSummary | null; stopped: boolean }) {
  return (
    <section className={card} aria-labelledby="progress-step">
      <h3 id="progress-step" className="text-base font-semibold text-neutral-800">5. Importando</h3>
      <p className="text-sm text-neutral-600">Puedes salir de esta página: la importación sigue en segundo plano. Para volver, ábrela desde el historial.</p>
      {batch ? <ProgressBar batch={batch} /> : <p role="status" className="text-sm text-neutral-600">Iniciando…</p>}
      {stopped && <p role="status" className="text-sm text-amber-700">Dejamos de consultar el avance. Revisa el historial para ver cómo va.</p>}
    </section>
  )
}

export function ResultRowItem({ row }: { row: BatchResultRow }) {
  return (
    <li className="space-y-1 rounded-md border border-neutral-200 p-3" data-status={row.status}>
      <p className="text-sm font-medium text-neutral-800">{row.sku || row.reference} <span className="font-normal text-neutral-600">{row.name}</span> <span className="text-xs text-neutral-400">fila {row.row}</span></p>
      <p className="text-xs font-semibold text-neutral-700">{RESULT_STATUS_LABELS[row.status] ?? row.status}</p>
      {row.error && <p className="text-xs text-red-700">{row.error}</p>}
      {row.applied.length > 0 && <p className="text-xs text-neutral-600">Se aplicó: {row.applied.map((a) => a.key ? `${a.field} (${a.key})` : a.field).join(', ')}</p>}
      {row.proposals.length > 0 && <>
        <ChangeTable title="Propuestas sin aplicar" changes={row.proposals} tone="proposal" />
        <p className="text-xs text-amber-700">Pendiente de revisión: esta pantalla no permite aprobar ni rechazar propuestas.</p>
      </>}
      {row.issues.length > 0 && <ul className="list-inside list-disc text-xs text-neutral-700">{row.issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issueLine(issue)}</li>)}</ul>}
    </li>
  )
}

export interface ResultViewProps {
  results: BatchResults
  onDownload: (format: 'xlsx' | 'csv') => void
  onRestart?: () => void
  downloadError?: string | null
}

export function ResultView({ results, onDownload, onRestart, downloadError }: ResultViewProps) {
  const { batch } = results
  return (
    <section className={card} aria-labelledby="result-step">
      <h3 id="result-step" className="text-base font-semibold text-neutral-800">6. Resultado: {BATCH_STATE_LABELS[batch.state]}</h3>
      <p className="text-sm text-neutral-600">{batch.fileName} · {formatDate(batch.createdAt)}</p>
      {batch.error && <ErrorBox message={batch.error} />}
      <dl className="flex flex-wrap gap-2">
        {countLines(batch.counts).map((line) => (
          <div key={line.status} className="min-w-28 rounded-md border border-neutral-200 bg-white px-3 py-2"><dt className="text-xs text-neutral-500">{line.label}</dt><dd className="text-lg font-semibold text-neutral-800">{line.value}</dd></div>
        ))}
      </dl>
      {results.unassigned.length > 0 && <UnassignedList issues={results.unassigned} />}
      <div className="max-h-[28rem] overflow-auto">
        {results.rows.length === 0 ? <p className="text-sm text-neutral-500">Esta importación no tiene productos.</p> : <ul className="space-y-2">{results.rows.map((row) => <ResultRowItem key={`${row.row}-${row.sku}`} row={row} />)}</ul>}
      </div>
      {downloadError && <ErrorBox message={downloadError} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={() => onDownload('xlsx')}>Descargar Excel</button>
        <button type="button" className={secondaryButton} onClick={() => onDownload('csv')}>Descargar CSV</button>
        {onRestart && <button type="button" className={primaryButton} onClick={onRestart}>Nueva importación</button>}
      </div>
    </section>
  )
}

export interface HistoryViewProps {
  items: BatchSummary[]
  page: number
  total: number
  pageSize: number
  loading: boolean
  error: string | null
  onOpen: (batchId: string) => void
  onPage: (page: number) => void
  children?: ReactNode
}

export function HistoryView({ items, page, total, pageSize, loading, error, onOpen, onPage, children }: HistoryViewProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <section className={card} aria-labelledby="history-title">
      <h3 id="history-title" className="text-base font-semibold text-neutral-800">Historial de importaciones</h3>
      {error && <ErrorBox message={error} />}
      {loading && <p role="status" className="text-sm text-neutral-600">Cargando historial…</p>}
      {!loading && !error && items.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay importaciones.</p>}
      {items.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-neutral-100 text-xs font-semibold uppercase text-neutral-600"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Persona</th><th className="px-3 py-2">Archivo</th><th className="px-3 py-2">Plantilla</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((batch) => (
                <tr key={batch.batchId} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(batch.createdAt)}</td>
                  <td className="px-3 py-2">{batch.userName ?? '—'}</td>
                  <td className="px-3 py-2">{batch.fileName}</td>
                  <td className="px-3 py-2">{batch.templateVersion}</td>
                  <td className="px-3 py-2 text-xs text-neutral-700">{batch.counts.CREATED} nuevos · {batch.counts.UPDATED} completados · {batch.counts.PROPOSED} propuestas · {batch.counts.INVALID + batch.counts.FAILED + batch.counts.STALE} sin aplicar</td>
                  <td className="px-3 py-2">{BATCH_STATE_LABELS[batch.state]}{batch.state === 'PROCESSING' ? ` (${progressPercent(batch.processed, batch.total)}%)` : ''}</td>
                  <td className="px-3 py-2"><button type="button" className={secondaryButton} onClick={() => onOpen(batch.batchId)}>{batch.state === 'PROCESSING' ? 'Ver avance' : 'Ver resultado'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className={secondaryButton} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages}</span>
          <button type="button" className={secondaryButton} disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</button>
        </div>
      )}
      {children}
    </section>
  )
}
