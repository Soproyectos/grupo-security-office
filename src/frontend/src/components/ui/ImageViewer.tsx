import { useEffect, useRef, type KeyboardEvent } from 'react'
import './ImageViewer.css'

export interface ViewerImage {
  id: string
  src: string
  alt?: string
}

interface ImageViewerProps {
  images: ViewerImage[]
  /** Index of the image shown; the parent owns it so the page gallery and the viewer stay in sync. */
  index: number
  open: boolean
  onIndexChange: (index: number) => void
  onClose: () => void
}

/** Full-screen image viewer over a blurred backdrop. Uses the native dialog: Esc, focus trap and inert page come free. */
export function ImageViewer({ images, index, open, onIndexChange, onClose }: ImageViewerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const count = images.length
  const current = images[index] ?? images[0]

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!current) return null

  const step = (delta: number) => {
    if (count < 2) return
    onIndexChange((index + delta + count) % count)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'ArrowLeft') step(-1)
    if (event.key === 'ArrowRight') step(1)
  }

  return (
    <dialog ref={ref} className="image-viewer" aria-label="Vista ampliada de la imagen" onClose={onClose} onKeyDown={onKeyDown} onClick={(event) => { if (event.target === ref.current) onClose() }}>
      <button type="button" className="image-viewer__btn image-viewer__close" onClick={onClose} aria-label="Cerrar vista ampliada">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      {count > 1 && (
        <button type="button" className="image-viewer__btn image-viewer__nav image-viewer__nav--prev" onClick={() => step(-1)} aria-label="Imagen anterior">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
      )}
      {count > 1 && (
        <button type="button" className="image-viewer__btn image-viewer__nav image-viewer__nav--next" onClick={() => step(1)} aria-label="Imagen siguiente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      )}
      <div className="image-viewer__stage" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
        <img src={current.src} alt={current.alt ?? ''} />
      </div>
      {count > 1 && (
        <div className="image-viewer__footer">
          <span className="image-viewer__count" aria-live="polite">{index + 1} de {count}</span>
          <div className="image-viewer__thumbs">
            {images.map((image, i) => (
              <button type="button" key={image.id} aria-label={`Ver imagen ${i + 1}`} aria-pressed={i === index} onClick={() => onIndexChange(i)}>
                <img src={image.src} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}
    </dialog>
  )
}
