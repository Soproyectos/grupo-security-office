import type { ProductImageType } from '../../../services/product-detail.service'

/** Largest photo accepted by the uploader (8 MB, same limit the server applies to brand images). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

export type PhotoRejection = 'not-image' | 'too-large'

export const PHOTO_REJECTION_REASON: Record<PhotoRejection, string> = {
  'not-image': 'no es una imagen',
  'too-large': 'pesa más de 8 MB',
}

/** Client-side check run before any request. The server still validates every file. */
export function photoRejection(file: Pick<File, 'type' | 'size'>): PhotoRejection | null {
  if (!file.type.startsWith('image/')) return 'not-image'
  if (file.size > MAX_PHOTO_BYTES) return 'too-large'
  return null
}

export interface PhotoVerdict {
  file: File
  rejection: PhotoRejection | null
}

/** Keeps the selection order so each file can be reported next to its verdict. */
export function checkPhotoFiles(files: readonly File[]): PhotoVerdict[] {
  return files.map((file) => ({ file, rejection: photoRejection(file) }))
}

export interface UploadedPhoto {
  id: string
  type?: string | null
}

export interface PhotoUploadSteps {
  /** The server ignores any type sent here and classifies the photo as PRINCIPAL. */
  upload: (file: File, asPrimary: boolean) => Promise<UploadedPhoto>
  /** Second request, sent only after the upload has succeeded. */
  assignType: (imageId: string, type: ProductImageType) => Promise<unknown>
}

export interface PhotoUploadOutcome {
  imageId: string
  /** False when the photo was uploaded but the chosen type could not be saved. */
  typeAssigned: boolean
}

/**
 * Uploads one photo and then assigns the chosen type when the server returned a different one.
 * A failed type change does not fail the upload: the photo already exists and is reported as partial.
 * A failed upload rejects, so the queue reports it as a failure.
 */
export async function uploadPhotoWithType(
  file: File,
  options: { type: ProductImageType; asPrimary: boolean },
  steps: PhotoUploadSteps,
): Promise<PhotoUploadOutcome> {
  const photo = await steps.upload(file, options.asPrimary)
  if (photo.type === options.type) return { imageId: photo.id, typeAssigned: true }
  try {
    await steps.assignType(photo.id, options.type)
    return { imageId: photo.id, typeAssigned: true }
  } catch {
    return { imageId: photo.id, typeAssigned: false }
  }
}

export type UploadQueueEvent<T> =
  | { type: 'start'; index: number; file: File }
  | { type: 'success'; index: number; file: File; value: T }
  | { type: 'failure'; index: number; file: File; error: unknown }

export type UploadQueueResult<T> =
  | { file: File; ok: true; value: T }
  | { file: File; ok: false; error: unknown }

/**
 * Runs the uploads one after another, in order. A failure is reported and the queue keeps going.
 * Never parallel: the next file starts only when the previous one has settled.
 */
export async function runUploadQueue<T>(
  files: readonly File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  onProgress: (event: UploadQueueEvent<T>) => void,
): Promise<UploadQueueResult<T>[]> {
  const results: UploadQueueResult<T>[] = []
  for (const [index, file] of files.entries()) {
    onProgress({ type: 'start', index, file })
    try {
      const value = await uploadOne(file, index)
      results.push({ file, ok: true, value })
      onProgress({ type: 'success', index, file, value })
    } catch (error) {
      results.push({ file, ok: false, error })
      onProgress({ type: 'failure', index, file, error })
    }
  }
  return results
}
