import { Link } from 'react-router-dom'
import { Button } from '../../components/ui'
import type { BulkTransitionRejected } from '../../services/product-detail.service'
import { bulkProblemText } from './publication-model'

export type BulkPublishPhase = 'idle' | 'confirming' | 'running' | 'done'

export interface BulkPublishOutcome {
  requested: number
  applied: number
  rejected: BulkTransitionRejected[]
}

interface BulkPublishBarProps {
  phase: BulkPublishPhase
  selectedCount: number
  /** Borradores que se pueden elegir en la página (con el filtro actual). */
  selectableCount: number
  outcome: BulkPublishOutcome | null
  /** Error general (sin permiso, sin conexión): nada se publicó o no se sabe. */
  errorMessage: string | null
  onToggleAll: (checked: boolean) => void
  onAskConfirm: () => void
  onCancelConfirm: () => void
  onConfirm: () => void
  onExit: () => void
  /** Ruta de la ficha de un producto, para corregir lo que falta. */
  editPath: (productId: string) => string
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

function problemsOf(item: BulkTransitionRejected): string[] {
  const list = item.problems?.length ? item.problems : [item.reason]
  return list.map(bulkProblemText)
}

/** Barra de la publicación masiva: selección, confirmación, avance y resumen por producto. */
export function BulkPublishBar({
  phase,
  selectedCount,
  selectableCount,
  outcome,
  errorMessage,
  onToggleAll,
  onAskConfirm,
  onCancelConfirm,
  onConfirm,
  onExit,
  editPath,
}: BulkPublishBarProps) {
  const allSelected = selectableCount > 0 && selectedCount === selectableCount
  const someSelected = selectedCount > 0 && !allSelected

  if (phase === 'done' && outcome) {
    const failed = outcome.rejected.length
    return (
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4" aria-label="Resultado de la publicación">
        <p className="text-sm font-semibold text-neutral-800" role="status">
          {outcome.applied === 0
            ? 'No se publicó ningún producto.'
            : `Se ${plural(outcome.applied, 'publicó 1 producto', `publicaron ${outcome.applied} productos`)} de ${outcome.requested}.`}
          {failed > 0 && ` ${failed} ${plural(failed, 'quedó', 'quedaron')} sin publicar porque ${plural(failed, 'le falta', 'les falta')} algo.`}
        </p>
        {failed > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="Productos que no se publicaron">
            {outcome.rejected.map((item) => (
              <li key={item.id} className="rounded-lg border border-neutral-200 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-neutral-800">
                    {item.name || 'Producto sin nombre'}
                    {item.sku && <span className="font-normal text-neutral-500"> · {item.sku}</span>}
                  </p>
                  <Link
                    to={editPath(item.id)}
                    className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                  >
                    Abrir ficha<span className="sr-only"> de {item.name || item.sku || 'este producto'}</span>
                  </Link>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-600">
                  {problemsOf(item).map((problem, index) => <li key={index}>{problem}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" onClick={onExit}>Listo</Button>
      </section>
    )
  }

  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 bg-white px-3 py-2" aria-label="Publicación masiva">
      {errorMessage && <p className="text-sm text-[var(--color-error)]" role="alert">{errorMessage}</p>}
      {phase === 'idle' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary)]"
              checked={allSelected}
              ref={(node) => { if (node) node.indeterminate = someSelected }}
              disabled={selectableCount === 0}
              onChange={(event) => onToggleAll(event.target.checked)}
            />
            Seleccionar todos los borradores de esta página ({selectableCount})
          </label>
          <p className="text-sm font-medium text-neutral-800" role="status">
            {selectedCount === 0 ? 'Ninguno seleccionado' : `${selectedCount} ${plural(selectedCount, 'seleccionado', 'seleccionados')}`}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={selectedCount === 0} onClick={onAskConfirm}>Publicar seleccionados</Button>
            <Button variant="secondary" onClick={onExit}>Cancelar selección</Button>
          </div>
        </div>
      )}
      {phase === 'confirming' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="Confirmar publicación">
          <p className="text-sm text-neutral-800">
            Vas a validar y publicar <strong>{selectedCount}</strong> {plural(selectedCount, 'producto', 'productos')}. Solo se publicarán los que cumplan todos los requisitos; los demás quedan sin cambios y te diremos qué les falta.
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={onConfirm}>Validar y publicar</Button>
            <Button variant="secondary" onClick={onCancelConfirm}>Volver</Button>
          </div>
        </div>
      )}
      {phase === 'running' && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading disabled>Publicando…</Button>
          <p className="text-sm text-neutral-600" role="status">
            Validando y publicando {selectedCount} {plural(selectedCount, 'producto', 'productos')}. Puede tardar unos segundos; no cierres esta página.
          </p>
        </div>
      )}
    </section>
  )
}
