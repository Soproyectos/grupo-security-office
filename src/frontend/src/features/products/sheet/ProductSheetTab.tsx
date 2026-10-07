import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '../../../components/ui'
import { getApiErrorMessage } from '../../../lib/apiError'
import { ProductSheetEditor } from './ProductSheetEditor'
import { fetchProductSheet, saveProductSheet, sheetKeys } from './sheet.service'
import type { ProductSheetPayload } from './sheet-form'

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

  const mutation = useMutation({
    mutationFn: (payload: ProductSheetPayload) => saveProductSheet(productId, payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(sheetKeys.detail(productId), saved)
      queryClient.invalidateQueries({ queryKey: ['product', productId] })
    },
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
      saveError={mutation.isError ? getApiErrorMessage(mutation.error, 'No se pudo guardar la ficha.') : null}
      saved={mutation.isSuccess}
      onSave={(payload) => mutation.mutate(payload)}
      onDirtyChange={handleDirtyChange}
      hideNav={hideNav}
    />
  )
}
