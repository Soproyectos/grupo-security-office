import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '../../../components/ui'
import { getApiErrorMessage } from '../../../lib/apiError'
import { ProductSheetEditor } from './ProductSheetEditor'
import { detectVersionConflict, type ProductSheetPayload } from './sheet-form'
import { latestValidation } from './sheet-revisions'
import { fetchProductRevisions, fetchProductSheet, saveProductSheet, sheetKeys, uploadProductAsset } from './sheet.service'

interface ProductSheetTabProps {
  productId: string
  lifecycleStatus?: string | null
  /** Reports unsaved edits so the page can warn before leaving the tab. */
  onDirtyChange?: (dirty: boolean) => void
  hideNav?: boolean
}

/** Container: loads the sheet, saves it and warns about unsaved edits on page unload. */
export function ProductSheetTab({ productId, lifecycleStatus, onDirtyChange, hideNav }: ProductSheetTabProps) {
  const queryClient = useQueryClient()
  const dirtyRef = useRef(false)

  const query = useQuery({
    queryKey: sheetKeys.detail(productId),
    queryFn: () => fetchProductSheet(productId),
    // The editor owns the draft; never overwrite it with a background refetch.
    refetchOnWindowFocus: false,
  })

  // CAT-03 (regla 5): estado de VALIDACIÓN leído del resumen de revisiones
  // (CAT-02). Solo informativa: validar/publicar pertenece a CAT-05/CAT-06.
  const revisionsQuery = useQuery({
    queryKey: sheetKeys.revisions(productId),
    queryFn: () => fetchProductRevisions(productId),
    refetchOnWindowFocus: false,
  })

  const mutation = useMutation({
    mutationFn: (payload: ProductSheetPayload) => saveProductSheet(productId, payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(sheetKeys.detail(productId), saved)
      queryClient.invalidateQueries({ queryKey: ['product', productId] })
      // Tras guardar, el backend marca revisión pendiente: refrescar el estado.
      queryClient.invalidateQueries({ queryKey: sheetKeys.revisions(productId) })
    },
  })

  // CAT-03 (H2): el 409 `sheet-version-conflict` merece un aviso propio — el
  // borrador local se CONSERVA (el error no toca la caché) y se muestra la
  // versión vigente. Otros errores siguen con el mensaje genérico.
  const conflict = mutation.isError ? detectVersionConflict(mutation.error) : null
  const saveError =
    mutation.isError && !conflict ? getApiErrorMessage(mutation.error, 'No se pudo guardar la ficha.') : null

  // CAT-04 (D5): subida verificada de un documento del editor de ficha. El
  // servidor comprueba el contenido real (PDF/imagen) y devuelve la URL.
  const uploadAsset = useMutation({
    mutationFn: (file: File) => uploadProductAsset(productId, 'DOCUMENT', file),
  })

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      dirtyRef.current = dirty
      onDirtyChange?.(dirty)
    },
    [onDirtyChange],
  )

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      onDirtyChange?.(false)
    }
  }, [onDirtyChange])

  if (query.isLoading) {
    return <div className="h-40 rounded-xl bg-neutral-100 animate-pulse" aria-busy="true" />
  }
  if (query.isError || !query.data) {
    return <Alert variant="error">{getApiErrorMessage(query.error, 'No se pudo cargar la ficha del producto.')}</Alert>
  }

  return (
    <ProductSheetEditor
      // Remount from the saved copy after each successful save: the draft resets to a clean baseline.
      key={query.data.updatedAt}
      sheet={query.data}
      lifecycleStatus={lifecycleStatus}
      saving={mutation.isPending}
      saveError={saveError}
      saved={mutation.isSuccess}
      conflict={conflict}
      validation={latestValidation(revisionsQuery.data)}
      onReload={() => {
        // Descarta el borrador local y trae la versión vigente del servidor.
        void query.refetch()
        mutation.reset()
      }}
      onSave={(payload) => mutation.mutate(payload)}
      onUploadAsset={(file) => uploadAsset.mutateAsync(file)}
      onDirtyChange={handleDirtyChange}
      hideNav={hideNav}
    />
  )
}
