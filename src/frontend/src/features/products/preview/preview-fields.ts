import { isPreviewField, type PreviewField } from './preview-model'

export const PREVIEW_FIELD_ATTR = 'data-preview-field'
export const PREVIEW_HIGHLIGHT_ATTR = 'data-preview-highlight'

/** Spread on an element to mark which sheet field it shows or edits: <h1 {...previewField('name')}>. */
export function previewField(field: PreviewField): { 'data-preview-field': PreviewField } {
  return { [PREVIEW_FIELD_ATTR]: field }
}

/** Minimal element shape so it can be tested without a DOM. */
export interface ClosestLike {
  closest(selector: string): { getAttribute(name: string): string | null } | null
}

/** The field of the closest marked ancestor (or the element itself); null when none or when the value is unknown. */
export function fieldFromElement(element: ClosestLike | null | undefined): PreviewField | null {
  const value = element?.closest(`[${PREVIEW_FIELD_ATTR}]`)?.getAttribute(PREVIEW_FIELD_ATTR)
  return isPreviewField(value) ? value : null
}
