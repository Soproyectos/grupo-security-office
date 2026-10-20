import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../services/api'
import type { Product } from '../types/product.types'
import { getApiErrorMessage } from '../../../lib/apiError'
import { Alert, Button } from '../../../components/ui'
import { SpecEditor, deserializeSpecFields, serializeSpecFields } from '../components/SpecEditor'

type SpecFields = ReturnType<typeof deserializeSpecFields>

const snapshotOf = (specs: SpecFields, extra: SpecFields) =>
  JSON.stringify([serializeSpecFields(specs), serializeSpecFields(extra)])

/** Basic product attributes (`technicalSpecs` and `extraAttributes`), saved with their own button. */
export function ProductAttributesSection({
  product,
  onDirtyChange,
}: {
  product: Product
  onDirtyChange?: (dirty: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [specs, setSpecs] = useState(() => deserializeSpecFields(product.technicalSpecs ?? null))
  const [extra, setExtra] = useState(() => deserializeSpecFields(product.extraAttributes ?? null))
  const [baseline, setBaseline] = useState(() => snapshotOf(specs, extra))
  const dirty = snapshotOf(specs, extra) !== baseline

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/products/${product.id}`, {
        technicalSpecs: Object.keys(serializeSpecFields(specs)).length ? serializeSpecFields(specs) : {},
        extraAttributes: Object.keys(serializeSpecFields(extra)).length ? serializeSpecFields(extra) : {},
      }),
    onSuccess: () => {
      setBaseline(snapshotOf(specs, extra))
      queryClient.invalidateQueries({ queryKey: ['product', product.id] })
    },
  })

  return (
    <div className="space-y-6">
      {mutation.isError && (
        <Alert variant="error">{getApiErrorMessage(mutation.error, 'No se pudieron guardar los atributos.')}</Alert>
      )}
      {mutation.isSuccess && !dirty && <Alert variant="success">Atributos guardados correctamente.</Alert>}

      <SpecEditor
        fields={specs}
        onChange={setSpecs}
        label="Especificaciones técnicas"
        placeholder="Agrega especificaciones como resolución, lente, visión nocturna, etc."
      />
      <SpecEditor
        fields={extra}
        onChange={setExtra}
        label="Atributos extra"
        placeholder="Agrega atributos como garantía, peso, color, etc."
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500" aria-live="polite">
          {dirty ? 'Hay cambios sin guardar en los atributos.' : 'Sin cambios pendientes.'}
        </span>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!dirty}>
          Guardar atributos
        </Button>
      </div>
    </div>
  )
}
