import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveAssetUrl } from '../../../services/api'
import type { Product } from '../types/product.types'
import { getApiErrorMessage } from '../../../lib/apiError'
import { Alert, Button } from '../../../components/ui'
import { publishedImagesNotice, type ImagesNotice } from './published-images'
import { fetchPublishedImages, sheetKeys } from './sheet.service'
import { validationKeys } from '../../catalog-validation/validation-api'
import {
  uploadProductImage,
  deleteProductImage,
  markProductImagePrimary,
  updateProductImageAlt,
  updateProductImageType,
  type ProductImageType,
  isNotImplemented,
} from '../../../services/product-detail.service'
import {
  PHOTO_REJECTION_REASON,
  checkPhotoFiles,
  runUploadQueue,
  uploadPhotoWithType,
  type PhotoUploadOutcome,
  type UploadQueueEvent,
} from './product-photos-queue'
import {
  IDLE_PHOTO_REMOVAL,
  photoRemovalPhase,
  photoRemovalReducer,
  type ActivePhotoRemovalPhase,
} from './product-photo-removal'

const IMAGE_TYPES: { value: ProductImageType; label: string }[] = [
  { value: 'PORTADA', label: 'Portada' },
  { value: 'LOGO', label: 'Logo' },
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'COMPLEMENTARIA', label: 'Complementaria' },
  { value: 'EXTRA', label: 'Extra' },
]

/** Touch-sized on phones; the compact size comes back from the md breakpoint. */
const TOUCH_MIN = 'min-h-[44px] md:min-h-0'
const ACTION_BUTTON = 'min-h-[44px]'
const REMOVED_NOTICE_MS = 4000

type UploadRowStatus = 'waiting' | 'uploading' | 'done' | 'partial' | 'failed' | 'rejected'

interface UploadRow {
  name: string
  status: UploadRowStatus
  /** Why a file was rejected or failed, without a trailing period. */
  reason?: string
}

function describeUploadRow(row: UploadRow): string {
  const name = `«${row.name}»`
  switch (row.status) {
    case 'waiting':
      return `${name}: En espera`
    case 'uploading':
      return `${name}: Subiendo…`
    case 'done':
      return `${name}: Listo`
    case 'partial':
      return `Se subió ${name} pero no se pudo asignar el tipo; cámbialo en la foto.`
    case 'failed':
      return `${name} no se subió: ${row.reason ?? ''}. Vuelve a elegirla para intentarlo.`
    case 'rejected':
      return `${name} no se subirá: ${row.reason ?? ''}.`
  }
}

function uploadRowTone(status: UploadRowStatus): string {
  if (status === 'failed' || status === 'rejected') return 'text-[var(--color-error-hover)]'
  if (status === 'partial') return 'text-[var(--color-warning-hover)]'
  return 'text-neutral-700'
}

function withoutTrailingPeriod(text: string): string {
  return text.replace(/\.$/, '')
}

function AltEditor({
  image,
  disabled = false,
  onSave,
}: {
  image: { id: string; alt?: string | null }
  disabled?: boolean
  onSave: (alt: string) => void
}) {
  const [alt, setAlt] = useState(image.alt ?? '')
  const dirty = alt !== (image.alt ?? '')

  return (
    <div className="flex gap-1.5 items-center">
      <input
        type="text"
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        disabled={disabled}
        className={`flex-1 min-w-0 px-2 py-1 ${TOUCH_MIN} border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed`}
        placeholder="Texto alternativo"
        aria-label="Texto alternativo de la imagen"
        maxLength={200}
      />
      <button
        type="button"
        disabled={disabled || !dirty}
        onClick={() => onSave(alt.trim())}
        className={`px-2 py-1 ${TOUCH_MIN} text-xs font-medium rounded border border-neutral-200 text-neutral-500 hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed shrink-0`}
      >
        Guardar
      </button>
    </div>
  )
}

/**
 * CAT-04 (frontend-imagenes): diferencia entre el borrador vivo y lo que la
 * tienda muestra hoy (galería del detalle público = lente de la revisión
 * publicada). Extraído para poder probarlo sin red.
 */
export function PublishedImagesNotice({ notice }: { notice: ImagesNotice }) {
  if (notice.state !== 'difiere') return null
  return (
    <Alert variant="info">
      <span data-testid="published-images-notice">{notice.message}</span>
      <span className="block text-xs text-neutral-500 mt-1">
        Subir, quitar o reordenar fotos aquí NO cambia lo que ve la tienda: la versión publicada anterior se conserva hasta la próxima publicación.
      </span>
    </Alert>
  )
}

export function PhotoMutationError({ error, fallback }: { error: unknown; fallback: string }) {
  return <Alert variant="error">{getApiErrorMessage(error, fallback)}</Alert>
}

/**
 * Inline confirmation that replaces the action row of one photo card.
 * Escape cancels it unless a delete is already running.
 */
export function PhotoRemovalPanel({
  phase,
  isPrimary,
  errorMessage,
  onConfirm,
  onCancel,
}: {
  phase: ActivePhotoRemovalPhase
  isPrimary: boolean
  errorMessage: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const busy = phase === 'deleting'

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      onCancel()
    }
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-1.5" onKeyDown={handleKeyDown}>
        <p role="alert" className="text-xs text-[var(--color-error-hover)]">
          {errorMessage}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="danger" autoFocus className={ACTION_BUTTON} onClick={onConfirm}>
            Reintentar
          </Button>
          <Button variant="secondary" className={ACTION_BUTTON} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div role="group" aria-label="Confirmar quitar la foto" className="space-y-1.5" onKeyDown={handleKeyDown}>
      <p className="text-xs font-medium text-neutral-800">¿Quitar esta foto?</p>
      {isPrimary && (
        <p className="text-xs text-neutral-500">Es la foto principal: el producto necesita una para poder publicarse.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button variant="danger" loading={busy} className={ACTION_BUTTON} onClick={onConfirm}>
          Quitar
        </Button>
        <Button variant="secondary" disabled={busy} autoFocus={!busy} className={ACTION_BUTTON} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

export function ProductPhotosSection({ product }: { product: Product }) {
  const queryClient = useQueryClient()
  const images = product.images ?? []

  // CAT-04: lo publicado llega del detalle PÚBLICO (ya lensado por la revisión
  // publicada). 404/no publicada → null: no hay «anterior» que comparar.
  const publishedQuery = useQuery({
    queryKey: ['published-images', product.id],
    queryFn: () => fetchPublishedImages(product.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const notice = publishedImagesNotice(images.map((img) => img.url), publishedQuery.data ?? null)

  const [newType, setNewType] = useState<ProductImageType>('PRINCIPAL')
  const [uploading, setUploading] = useState(false)
  const [rows, setRows] = useState<UploadRow[]>([])
  const [removal, dispatchRemoval] = useReducer(photoRemovalReducer, IDLE_PHOTO_REMOVAL)
  const [removedNotice, setRemovedNotice] = useState(false)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const returnFocusTo = useRef<string | null>(null)

  useEffect(() => {
    if (!removedNotice) return
    const timer = window.setTimeout(() => setRemovedNotice(false), REMOVED_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [removedNotice])

  // After Cancelar or Escape the confirmation unmounts: focus returns to that photo's «Quitar».
  useEffect(() => {
    const target = returnFocusTo.current
    if (removal.phase !== 'idle' || target === null) return
    returnFocusTo.current = null
    triggerRefs.current.get(target)?.focus()
  }, [removal])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['product', product.id] })
    void queryClient.invalidateQueries({ queryKey: validationKeys.report(product.id) })
    void queryClient.invalidateQueries({ queryKey: sheetKeys.revisions(product.id) })
  }

  const remove = useMutation({
    mutationFn: (imageId: string) => deleteProductImage(imageId),
    onSuccess: () => {
      dispatchRemoval({ type: 'succeeded' })
      setRemovedNotice(true)
      refresh()
    },
    onError: () => dispatchRemoval({ type: 'failed' }),
  })

  const primary = useMutation({
    mutationFn: (imageId: string) => markProductImagePrimary(imageId),
    onSuccess: refresh,
  })

  const updateAlt = useMutation({
    mutationFn: ({ imageId, alt }: { imageId: string; alt: string }) =>
      updateProductImageAlt(imageId, alt),
    onSuccess: refresh,
  })

  const updateImageType = useMutation({
    mutationFn: ({ imageId, type }: { imageId: string; type: ProductImageType }) =>
      updateProductImageType(imageId, type),
    onSuccess: refresh,
  })

  const uploadFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    const verdicts = checkPhotoFiles(selected)
    // Rows keep the selection order. Only accepted files are queued, and each keeps its row position.
    setRows(
      verdicts.map(({ file, rejection }) =>
        rejection === null
          ? { name: file.name, status: 'waiting' }
          : { name: file.name, status: 'rejected', reason: PHOTO_REJECTION_REASON[rejection] },
      ),
    )
    const queued = verdicts.flatMap((verdict, rowIndex) =>
      verdict.rejection === null ? [{ file: verdict.file, rowIndex }] : [],
    )
    if (queued.length === 0) return

    const chosenType = newType
    const startedWithoutPhotos = images.length === 0
    let primaryTaken = false
    const updateRow = (rowIndex: number, patch: Partial<UploadRow>) =>
      setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row)))

    setUploading(true)
    await runUploadQueue(
      queued.map((item) => item.file),
      async (file) => {
        // Same rule as before: the first photo of a product without photos becomes its principal.
        const asPrimary = startedWithoutPhotos && !primaryTaken
        const outcome = await uploadPhotoWithType(
          file,
          { type: chosenType, asPrimary },
          {
            upload: (target, primaryFlag) => uploadProductImage(product.id, target, primaryFlag),
            assignType: updateProductImageType,
          },
        )
        if (asPrimary) primaryTaken = true
        return outcome
      },
      (event: UploadQueueEvent<PhotoUploadOutcome>) => {
        const item = queued[event.index]
        if (!item) return
        const rowIndex = item.rowIndex
        if (event.type === 'start') {
          updateRow(rowIndex, { status: 'uploading' })
        } else if (event.type === 'failure') {
          updateRow(rowIndex, { status: 'failed', reason: withoutTrailingPeriod(getApiErrorMessage(event.error)) })
        } else {
          updateRow(rowIndex, { status: event.value.typeAssigned ? 'done' : 'partial' })
        }
      },
    )
    setUploading(false)
    refresh()
  }

  const cancelRemoval = (imageId: string) => {
    returnFocusTo.current = imageId
    dispatchRemoval({ type: 'cancel' })
  }

  const removeErrorMessage = remove.isError
    ? getApiErrorMessage(remove.error, 'No se pudo quitar la foto. Inténtalo de nuevo.')
    : ''
  const isDeleting = removal.phase === 'deleting'

  return (
    <div className="space-y-4">
      {primary.isError && (isNotImplemented(primary.error)
        ? <Alert variant="info">Marcar imagen como principal estará disponible próximamente.</Alert>
        : <PhotoMutationError error={primary.error} fallback="No se pudo cambiar la imagen principal." />)}
      {updateAlt.isError && (isNotImplemented(updateAlt.error)
        ? <Alert variant="info">Editar el texto alternativo estará disponible próximamente.</Alert>
        : <PhotoMutationError error={updateAlt.error} fallback="No se pudo guardar el texto alternativo." />)}
      {updateImageType.isError && (
        <PhotoMutationError error={updateImageType.error} fallback="No se pudo guardar el tipo de imagen." />
      )}
      <PublishedImagesNotice notice={notice} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-neutral-700">Tipo de las fotos nuevas</span>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as ProductImageType)}
            disabled={uploading}
            className={`block ${TOUCH_MIN} px-2 py-1 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {IMAGE_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label
          className={`inline-flex min-h-[44px] items-center gap-2 px-4 py-2.5 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 transition-colors focus-within:ring-2 focus-within:ring-[var(--color-primary-focus-ring)] ${
            uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Subir fotos
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? [])
              e.target.value = ''
              void uploadFiles(selected)
            }}
          />
        </label>

        {/* Live regions stay mounted so screen readers announce their changes; they take a full row only when they have text. */}
        <div aria-live="polite" className={rows.length > 0 ? 'basis-full' : undefined}>
          {rows.length > 0 && (
            <ul className="space-y-1 text-xs">
              {rows.map((row, index) => (
                <li key={index} className={`break-words ${uploadRowTone(row.status)}`}>
                  {describeUploadRow(row)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div aria-live="polite" className={removedNotice ? 'basis-full' : undefined}>
          {removedNotice && <p className="text-xs text-neutral-700">Foto quitada.</p>}
        </div>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-neutral-500 py-6 text-center">
          Aún no hay fotos. Sube la primera para poder publicar el producto.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((img, index) => {
            const phase = photoRemovalPhase(removal, img.id)
            const busy = phase === 'deleting'
            return (
              <div key={img.id} className="border border-neutral-200 rounded-lg overflow-hidden">
                <img
                  src={resolveAssetUrl(img.url)}
                  alt={img.alt ?? product.name}
                  className="w-full h-28 object-cover bg-neutral-100"
                />
                <div className="p-2 space-y-1.5">
                  <AltEditor image={img} disabled={busy} onSave={(alt) => updateAlt.mutate({ imageId: img.id, alt })} />
                  <div className="space-y-2">
                    <label className="block text-[10px] text-neutral-500">
                      Tipo de imagen
                      <select
                        value={img.type ?? 'PRINCIPAL'}
                        onChange={(e) => updateImageType.mutate({ imageId: img.id, type: e.target.value as ProductImageType })}
                        disabled={busy || updateImageType.isPending}
                        className={`mt-0.5 block w-full min-w-0 ${TOUCH_MIN} text-xs px-2 py-1 border border-neutral-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {IMAGE_TYPES.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    {phase === 'idle' ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={img.isPrimary || primary.isPending || busy}
                          onClick={() => primary.mutate(img.id)}
                          className={`text-xs font-medium rounded px-2 py-1 ${TOUCH_MIN} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                            img.isPrimary
                              ? 'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)] cursor-default'
                              : 'text-neutral-500 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                        >
                          {img.isPrimary ? 'Principal del producto' : 'Hacer principal del producto'}
                        </button>
                        <button
                          ref={(el) => {
                            if (el) triggerRefs.current.set(img.id, el)
                            else triggerRefs.current.delete(img.id)
                          }}
                          type="button"
                          disabled={isDeleting}
                          aria-label={`Quitar la foto ${index + 1}`}
                          onClick={() => dispatchRemoval({ type: 'open', imageId: img.id })}
                          className={`px-2 py-1 ${TOUCH_MIN} text-xs font-medium rounded text-neutral-500 hover:text-[var(--color-error-hover)] hover:bg-[var(--color-error-bg-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <PhotoRemovalPanel
                        phase={phase}
                        isPrimary={img.isPrimary}
                        errorMessage={removeErrorMessage}
                        onConfirm={() => {
                          dispatchRemoval({ type: 'confirm', imageId: img.id })
                          remove.mutate(img.id)
                        }}
                        onCancel={() => cancelRemoval(img.id)}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        El tipo clasifica la imagen y es independiente de la foto principal del producto. Las fotos se guardan al instante.
      </p>
    </div>
  )
}
