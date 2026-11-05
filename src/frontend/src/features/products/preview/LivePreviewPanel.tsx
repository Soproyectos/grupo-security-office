import { useMemo } from 'react'
import { useOptionalSheetDraft } from '../sheet/SheetDraftContext'
import type { ProductDetail } from '../types'
import type { Product } from '../types/product.types'
import { LivePreviewView } from './LivePreviewView'
import {
  buildPreviewProduct,
  describePreviewField,
  describeSectionWithoutPreview,
  type PreviewCaption,
  type PreviewField,
  type PreviewInput,
} from './preview-model'

export interface LivePreviewPanelProps {
  product: Product
  values: PreviewInput['values']
  activeField: PreviewField | null
  activeSection: string
  onSelectField: (field: PreviewField) => void
  /** Key data of the draft projection (not the published one). */
  keySpecItems?: { label: string; value: string }[]
}

const LOADING_CAPTION: PreviewCaption = { title: 'Vista previa', text: 'Preparando la vista previa…', empty: false }

/** Storefront preview of the editor draft. Without a sheet draft there is nothing to preview yet. */
export function LivePreviewPanel({ product, values, activeField, activeSection, onSelectField, keySpecItems }: LivePreviewPanelProps) {
  const draft = useOptionalSheetDraft()
  const form = draft?.form ?? null
  const { name, brandName, description } = values

  const preview = useMemo(
    () => (form ? buildPreviewProduct({ product, values: { name, brandName, description }, form, keySpecItems }) : null),
    [product, name, brandName, description, form, keySpecItems],
  )

  const caption = preview ? captionFor(preview, activeField, activeSection) : LOADING_CAPTION

  return <LivePreviewView preview={preview} caption={caption} activeField={activeField} onSelectField={onSelectField} />
}

/** The field being edited wins; otherwise the section, and otherwise the generic hint. */
function captionFor(preview: ProductDetail, activeField: PreviewField | null, activeSection: string): PreviewCaption {
  if (activeField !== null) return describePreviewField(activeField, preview)
  return describeSectionWithoutPreview(activeSection) ?? describePreviewField(null, preview)
}
