import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApiErrorMessage } from '../../lib/apiError'
import { ValidationPanel } from './ValidationPanel'
import { fetchValidationReport, validateProduct, validationKeys } from './validation-api'

/**
 * CAT-05 `frontend` — bloque conectado de validación de un producto. Un solo
 * motor en el servidor; aquí solo se consulta el informe y se dispara el
 * recálculo. `canEditSheet` governa los enlaces a secciones de la ficha
 * (sin permiso el problema se ve sin habilitar la acción — diseño §6).
 */
export function ValidationSection({ productId, canEditSheet }: { productId: string; canEditSheet: boolean }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: validationKeys.report(productId),
    queryFn: () => fetchValidationReport(productId),
    refetchOnWindowFocus: false,
  })
  const mutation = useMutation({
    mutationFn: () => validateProduct(productId),
    onSuccess: (report) => queryClient.setQueryData(validationKeys.report(productId), report),
  })

  return (
    <ValidationPanel
      report={query.data ?? null}
      canEditSheet={canEditSheet}
      validating={mutation.isPending}
      error={mutation.isError ? getApiErrorMessage(mutation.error, 'No se pudo validar el producto.') : query.isError ? 'No se pudo cargar el informe.' : null}
      onValidate={() => mutation.mutate()}
    />
  )
}
