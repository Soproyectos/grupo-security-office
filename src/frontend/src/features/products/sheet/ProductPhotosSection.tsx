import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { resolveAssetUrl } from '../../../services/api'
import type { Product } from '../types/product.types'
import { getApiErrorMessage } from '../../../lib/apiError'
import { Alert } from '../../../components/ui'
import { publishedImagesNotice, type ImagesNotice } from './published-images'
import { fetchPublishedImages } from './sheet.service'
import {
  uploadProductImage,
  deleteProductImage,
  markProductImagePrimary,
  updateProductImageAlt,
  isNotImplemented,
} from '../../../services/product-detail.service'

function AltEditor({
  image,
  onSave,
}: {
  image: { id: string; alt?: string | null }
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
        className="flex-1 min-w-0 px-2 py-1 border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)]"
        placeholder="Texto alternativo"
        aria-label="Texto alternativo de la imagen"
        maxLength={200}
      />
      <button
        type="button"
        disabled={!dirty}
        onClick={() => onSave(alt.trim())}
        className="px-2 py-1 text-xs font-medium rounded border border-neutral-200 text-neutral-500 hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
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

export function ProductPhotosSection({ product }: { product: Product }) {
  const queryClient = useQueryClient()
  const images = product.images ?? []
  const IMAGE_TYPES = ['PORTADA', 'LOGO', 'PRINCIPAL', 'COMPLEMENTARIA', 'EXTRA'] as const

  // CAT-04: lo publicado llega del detalle PÚBLICO (ya lensado por la revisión
  // publicada). 404/no publicada → null: no hay «anterior» que comparar.
  const publishedQuery = useQuery({
    queryKey: ['published-images', product.id],
    queryFn: () => fetchPublishedImages(product.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const notice = publishedImagesNotice(images.map((img) => img.url), publishedQuery.data ?? null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product', product.id] })
  }

  const upload = useMutation({
    mutationFn: (file: File) => uploadProductImage(product.id, file, images.length === 0),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (imageId: string) => deleteProductImage(imageId),
    onSuccess: refresh,
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
    mutationFn: ({ imageId, type }: { imageId: string; type: string }) =>
      api.patch(`/products/images/${imageId}`, { type }),
    onSuccess: refresh,
  })

  return (
    <div className="space-y-4">
      {upload.isError && (
        <Alert variant="error">
          {getApiErrorMessage(upload.error, 'Error al subir la imagen. Máximo 8MB.')}
        </Alert>
      )}
      {primary.isError && isNotImplemented(primary.error) && (
        <Alert variant="info">Marcar imagen como principal estará disponible próximamente.</Alert>
      )}
      {updateAlt.isError && isNotImplemented(updateAlt.error) && (
        <Alert variant="info">Editar el texto alternativo estará disponible próximamente.</Alert>
      )}
      <PublishedImagesNotice notice={notice} />

      <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer transition-colors">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Subir imagen
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            e.target.value = ''
          }}
        />
      </label>
      {upload.isPending && <p className="text-xs text-neutral-400">Subiendo imagen...</p>}

      {images.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center">No hay imágenes aún.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img.id} className="border border-neutral-200 rounded-lg overflow-hidden">
              <img
                src={resolveAssetUrl(img.url)}
                alt={img.alt ?? product.name}
                className="w-full h-28 object-cover bg-neutral-100"
              />
              <div className="p-2 space-y-1.5">
                <AltEditor image={img} onSave={(alt) => updateAlt.mutate({ imageId: img.id, alt })} />
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-full font-medium">
                    {img.type ?? 'PRINCIPAL'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={img.type ?? 'PRINCIPAL'}
                      onChange={(e) => updateImageType.mutate({ imageId: img.id, type: e.target.value })}
                      disabled={updateImageType.isPending}
                      className="text-xs px-2 py-1 border border-neutral-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      aria-label="Cambiar tipo de imagen"
                    >
                      {IMAGE_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={img.isPrimary || primary.isPending}
                      onClick={() => primary.mutate(img.id)}
                      className={`text-xs font-medium rounded px-2 py-1 transition-colors ${
                        img.isPrimary
                          ? 'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)] cursor-default'
                          : 'text-neutral-500 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)]'
                      }`}
                    >
                      {img.isPrimary ? 'Principal' : 'Hacer principal'}
                    </button>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm('¿Eliminar esta imagen?')) remove.mutate(img.id)
                      }}
                      className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Eliminar"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-400">
        Las fotos se guardan al instante: subir una imagen, cambiar la principal, el tipo, el texto alternativo
        o eliminarla no necesita otro botón.
      </p>
    </div>
  )
}
