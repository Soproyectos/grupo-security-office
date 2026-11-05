import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '../../../components/ui'
import { getApiErrorMessage } from '../../../lib/apiError'
import type { RenderFichaSection } from './FichaSection'
import { ProductSheetEditor } from './ProductSheetEditor'
import { SheetDraftProvider } from './SheetDraftContext'
import { detectVersionConflict, type ProductSheetPayload } from './sheet-form'
import { latestValidation } from './sheet-revisions'
import { fetchProductRevisions, fetchProductSheet, saveProductSheet, sheetKeys, uploadProductAsset } from './sheet.service'

interface ProductSheetTabProps {
  productId: string
  lifecycleStatus?: string | null
  /** Reports unsaved edits so the page can warn before leaving the tab. */
  onDirtyChange?: (dirty: boolean) => void
  hideNav?: boolean
  /** Rendered inside a page that owns the primary action (see ProductSheetEditor). */
  embedded?: boolean
  /** Embedded only: the host page renders each block as its own section. */
  renderSection?: RenderFichaSection
  /** Embedded only: whether the sticky save bar may show (false while another section is open). */
  saveBarVisible?: boolean
}

/** Container: loads the sheet, saves it and warns about unsaved edits on page unload. */
export function ProductSheetTab({ productId, lifecycleStatus, onDirtyChange, hideNav, embedded, renderSection, saveBarVisible }: ProductSheetTabProps) {
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
      embedded={embedded}
      renderSection={renderSection}
      saveBarVisible={saveBarVisible}
    />
  )
}

const SHEET_LOAD_ERROR = 'No se pudo cargar esta parte de la ficha. Recarga la página.'

interface SheetScopeState {
  status: 'loading' | 'error' | 'ready'
  message: string
}

const SheetScopeContext = createContext<SheetScopeState>({ status: 'loading', message: '' })

interface ProductSheetScopeProps {
  productId: string
  lifecycleStatus?: string | null
  /** Reports unsaved sheet edits so the page can warn before leaving. */
  onDirtyChange?: (dirty: boolean) => void
  children: ReactNode
}

/**
 * Page-level container of the sheet: loads it, saves it and warns about unsaved edits.
 * Its children are the page sections; the sheet blocks among them render through SheetSlot.
 */
export function ProductSheetScope({ productId, lifecycleStatus, onDirtyChange, children }: ProductSheetScopeProps) {
  const queryClient = useQueryClient()
  const dirtyRef = useRef(false)

  const query = useQuery({
    queryKey: sheetKeys.detail(productId),
    queryFn: () => fetchProductSheet(productId),
    // The editor owns the draft; never overwrite it with a background refetch.
    refetchOnWindowFocus: false,
  })

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
      queryClient.invalidateQueries({ queryKey: sheetKeys.revisions(productId) })
    },
  })

  // Same 409 handling as ProductSheetTab: the local draft is kept and the current version is shown.
  const conflict = mutation.isError ? detectVersionConflict(mutation.error) : null
  const saveError =
    mutation.isError && !conflict ? getApiErrorMessage(mutation.error, 'No se pudo guardar la ficha.') : null

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

  // A failed sheet load must not take the other sections down: they keep rendering, only the blocks wait.
  const scope: SheetScopeState = query.data
    ? { status: 'ready', message: '' }
    : query.isError
      ? { status: 'error', message: SHEET_LOAD_ERROR }
      : { status: 'loading', message: '' }

  return (
    <SheetScopeContext.Provider value={scope}>
      {query.data ? (
        <SheetDraftProvider
          // No key: the provider restarts its own draft when sheet.updatedAt changes, so the blocks keep their state.
          sheet={query.data}
          lifecycleStatus={lifecycleStatus}
          saving={mutation.isPending}
          saveError={saveError}
          saved={mutation.isSuccess}
          conflict={conflict}
          validation={latestValidation(revisionsQuery.data)}
          onReload={() => {
            void query.refetch()
            mutation.reset()
          }}
          onSave={(payload) => mutation.mutateAsync(payload).then(() => true, () => false)}
          onUploadAsset={(file) => uploadAsset.mutateAsync(file)}
          onDirtyChange={handleDirtyChange}
          embedded
          saveBarVisible
        >
          {children}
        </SheetDraftProvider>
      ) : (
        children
      )}
    </SheetScopeContext.Provider>
  )
}

/** Shows a block of the sheet only once its draft is loaded: a skeleton while loading, one line if it failed. */
export function SheetSlot({ children }: { children: ReactNode }) {
  const scope = useContext(SheetScopeContext)
  if (scope.status === 'ready') return <>{children}</>
  if (scope.status === 'error') return <p role="alert" className="text-sm text-red-600">{scope.message}</p>
  return <div className="h-24 rounded-xl bg-neutral-100 animate-pulse" aria-busy="true" />
}
