/**
 * CAT-04 `frontend-imagenes` — el borrador de fotos NO cambia lo que la tienda
 * muestra: la presentación pública viene de la REVISIÓN PUBLICADA (lente
 * CAT-02/§11 D2). Esta utilidad compara el borrador vivo con lo publicado y
 * redacta el aviso, sin inventar reglas.
 */
export interface PublishedImageRef {
  src: string
  alt: string
}

export type ImagesNotice =
  | { state: 'sin_publicar' | 'igual'; message: string | null; added: number; removed: number }
  | { state: 'difiere'; message: string; added: number; removed: number }

const norm = (urls: string[]): string[] => urls.map((u) => u.trim()).filter(Boolean)

/**
 * `published === null` = todavía sin revisión publicada (la tienda vería las
 * filas vivas; no hay nada «anterior» que conservar).
 */
export function publishedImagesNotice(liveUrls: string[], published: PublishedImageRef[] | null): ImagesNotice {
  if (published === null) return { state: 'sin_publicar', message: null, added: 0, removed: 0 }
  const live = norm(liveUrls)
  const pub = norm(published.map((p) => p.src))
  const added = live.filter((u) => !pub.includes(u)).length
  const removed = pub.filter((u) => !live.includes(u)).length
  if (added === 0 && removed === 0) return { state: 'igual', message: null, added, removed }
  const partes: string[] = []
  if (added) partes.push(`${added} ${added === 1 ? 'aún no visible' : 'aún no visibles'}`)
  if (removed) partes.push(`${removed} ${removed === 1 ? 'sigue publicándose' : 'siguen publicándose'} hasta la próxima publicación`)
  return {
    state: 'difiere',
    message: `La tienda conserva la imagen publicada anterior: ${partes.join('; ')}.`,
    added,
    removed,
  }
}
