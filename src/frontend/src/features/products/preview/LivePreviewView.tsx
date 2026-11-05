import type { ProductDetail } from '../types'
import { PreviewFrame } from './PreviewFrame'
import type { PreviewCaption, PreviewField } from './preview-model'

export interface LivePreviewViewProps {
  preview: ProductDetail | null
  caption: PreviewCaption
  activeField: PreviewField | null
  onSelectField: (field: PreviewField) => void
}

export function LivePreviewView({ preview, caption, activeField, onSelectField }: LivePreviewViewProps) {
  return (
    <section aria-labelledby="live-preview-title" className="biblioteca-editor__preview-panel">
      <h3 id="live-preview-title">Así lo ve el cliente</h3>
      <p>Muestra de la tienda en el celular. Aquí no se puede comprar ni abrir enlaces.</p>
      <p className="biblioteca-editor__preview-draft" data-testid="preview-draft-banner">
        <strong>Borrador</strong> Esto es lo que se vería con tus cambios. La ficha publicada no cambia hasta que la publiques.
      </p>
      <div
        role="status"
        aria-live="polite"
        data-empty={caption.empty ? 'true' : 'false'}
        className="biblioteca-editor__preview-caption"
      >
        <strong>{caption.title}</strong> <span>{caption.text}</span>
      </div>
      {preview ? (
        <PreviewFrame product={preview} activeField={activeField} onSelectField={onSelectField} />
      ) : (
        <div className="biblioteca-editor__preview-skeleton" aria-busy="true">
          <div className="biblioteca-editor__preview-skeleton-block motion-safe:animate-pulse" aria-hidden="true" />
          <p>Preparando la vista previa…</p>
        </div>
      )}
    </section>
  )
}
