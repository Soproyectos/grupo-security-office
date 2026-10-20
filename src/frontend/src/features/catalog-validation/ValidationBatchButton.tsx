import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { describeBatch } from './validation-model'
import { validateBatch } from './validation-api'

/**
 * CAT-05 `frontend` — validar el alcance MOSTRADO (diseño §6: el botón revisa
 * los productos autorizados de lo que la persona ve, no solo la página).
 * El lote es el de la lista visible; el trabajo con TODOS los filtros/páginas
 * es un job asíncrono de CAT-07 — aquí se corta con el tope del servidor.
 * `omitted`/`failed` salen contados y sin revelar datos ajenos.
 */
export const BATCH_PAGE_LIMIT = 200

export function ValidationBatchButton({ productIds }: { productIds: string[] }) {
  const [summary, setSummary] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => validateBatch(productIds),
    onSuccess: (s) => setSummary(describeBatch(s)),
  })
  const tooMany = productIds.length > BATCH_PAGE_LIMIT

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        loading={mutation.isPending}
        disabled={productIds.length === 0 || tooMany}
        onClick={() => mutation.mutate()}
      >
        Validar lo mostrado
      </Button>
      {tooMany && (
        <p className="text-xs text-neutral-500">
          La validación por lote admite hasta {BATCH_PAGE_LIMIT} productos; reduce el filtro o usa el trabajo con filtros completos (CAT-07).
        </p>
      )}
      {mutation.isError && <Alert variant="error">{getApiErrorMessage(mutation.error, 'No se pudo validar la selección.')}</Alert>}
      {summary && (
        <p className="text-xs text-neutral-600" data-testid="batch-summary" aria-live="polite">
          {summary}
        </p>
      )}
    </div>
  )
}
