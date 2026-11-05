import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ProductDetailPage } from '../components/ProductDetailPage'
import type { ProductDetail } from '../types'
import { scrollBehavior } from './focus-field'
import { PREVIEW_FIELD_ATTR, PREVIEW_HIGHLIGHT_ATTR, fieldFromElement } from './preview-fields'
import type { PreviewField } from './preview-model'
import { FRAME_ROOT_ID, useFrameMountNode } from './use-frame-document'

// Constant: the iframe must never reload on re-render.
const FRAME_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="${FRAME_ROOT_ID}"></div></body></html>`

/** Events that would act on the storefront (links, buttons, forms); they are swallowed inside the frame. */
const BLOCKED_EVENTS = ['click', 'auxclick', 'submit'] as const

interface PreviewFrameProps {
  product: ProductDetail
  activeField: PreviewField | null
  onSelectField: (field: PreviewField) => void
}

/** Field of the element under a click; null when the target is not an element or sits outside every marked zone. */
function fieldAt(target: EventTarget | null): PreviewField | null {
  // No `instanceof Element` here: the frame has its own realm, so the check is by shape.
  return target !== null && 'closest' in target ? fieldFromElement(target as Element) : null
}

/**
 * The real storefront page inside a same-origin iframe, so its viewport media queries act like a phone screen.
 * The page is portaled into the frame, so the router and other React context are shared with the editor.
 */
export function PreviewFrame({ product, activeField, onSelectField }: PreviewFrameProps): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const mountNode = useFrameMountNode(frameRef)
  const selectRef = useRef(onSelectField)

  useEffect(() => {
    selectRef.current = onSelectField
  }, [onSelectField])

  // Capture phase, so the storefront never sees the click. A click on a field asks the editor to focus it.
  useEffect(() => {
    if (!mountNode) return
    const frameDoc = mountNode.ownerDocument
    const onBlockedEvent = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      const field = fieldAt(event.target)
      if (field !== null && field !== 'internal') selectRef.current(field)
    }
    for (const type of BLOCKED_EVENTS) frameDoc.addEventListener(type, onBlockedEvent, true)
    return () => {
      for (const type of BLOCKED_EVENTS) frameDoc.removeEventListener(type, onBlockedEvent, true)
    }
  }, [mountNode])

  // React re-creates storefront nodes when the product changes, so the highlight is set again on every change.
  useEffect(() => {
    if (!mountNode) return
    const frameDoc = mountNode.ownerDocument
    frameDoc
      .querySelectorAll(`[${PREVIEW_HIGHLIGHT_ATTR}]`)
      .forEach((node) => node.removeAttribute(PREVIEW_HIGHLIGHT_ATTR))
    if (activeField === null) return
    frameDoc
      .querySelectorAll(`[${PREVIEW_FIELD_ATTR}="${activeField}"]`)
      .forEach((node) => node.setAttribute(PREVIEW_HIGHLIGHT_ATTR, ''))
  }, [mountNode, product, activeField])

  // Runs only when the active field changes, never per keystroke. It scrolls the frame's own window:
  // scrollIntoView would also move the editor page around it.
  useEffect(() => {
    if (!mountNode || activeField === null) return
    const frameWin = mountNode.ownerDocument.defaultView
    const target = mountNode.ownerDocument.querySelector<HTMLElement>(`[${PREVIEW_HIGHLIGHT_ATTR}]`)
    if (!frameWin || !target) return
    const rect = target.getBoundingClientRect()
    const fullyVisible = rect.top >= 0 && rect.bottom <= frameWin.innerHeight
    if (fullyVisible) return
    frameWin.scrollTo({
      top: frameWin.scrollY + rect.top - frameWin.innerHeight / 2 + rect.height / 2,
      behavior: scrollBehavior(frameWin),
    })
  }, [mountNode, activeField])

  return (
    <>
      <iframe
        ref={frameRef}
        title="Vista previa de la ficha en la tienda"
        tabIndex={-1}
        sandbox="allow-same-origin"
        srcDoc={FRAME_HTML}
        className="biblioteca-editor__preview-frame"
      />
      {mountNode && createPortal(<ProductDetailPage product={product} />, mountNode)}
    </>
  )
}
