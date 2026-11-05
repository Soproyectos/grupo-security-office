import { useEffect, useState, type RefObject } from 'react'
import { PREVIEW_FRAME_CSS } from './preview-frame-css'

/** Id of the element the storefront renders into, inside the frame document. */
export const FRAME_ROOT_ID = 'preview-root'
const FRAME_STYLE_ID = 'preview-frame-css'
const CLONE_ATTR = 'data-preview-clone'

/**
 * Copies the editor's stylesheets into the frame and adds the preview rules.
 * Idempotent: copies from an earlier run are removed first, so StrictMode's double effects never stack them.
 */
export function prepareFrameDocument(frameDoc: Document, parentDoc: Document): void {
  const head = frameDoc.head
  head.querySelectorAll(`[${CLONE_ATTR}]`).forEach((node) => node.remove())
  parentDoc.head.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style').forEach((node) => {
    const copy = node.cloneNode(true) as HTMLElement
    copy.setAttribute(CLONE_ATTR, '')
    head.append(copy)
  })

  head.querySelector(`#${FRAME_STYLE_ID}`)?.remove()
  const style = frameDoc.createElement('style')
  style.id = FRAME_STYLE_ID
  style.textContent = PREVIEW_FRAME_CSS
  head.append(style)
}

/**
 * The element inside the iframe where the storefront is portaled. Null until the frame document has loaded
 * and holds its root element and the copied styles.
 */
export function useFrameMountNode(frameRef: RefObject<HTMLIFrameElement>): HTMLElement | null {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const iframe = frameRef.current
    if (!iframe) return

    const attach = () => {
      const frameDoc = iframe.contentDocument
      if (!frameDoc || frameDoc.readyState !== 'complete') return
      const root = frameDoc.getElementById(FRAME_ROOT_ID)
      if (!root) return
      prepareFrameDocument(frameDoc, iframe.ownerDocument)
      setMountNode(root)
    }

    iframe.addEventListener('load', attach)
    // The load event may have fired before this effect ran (fast load, StrictMode's second run).
    attach()
    return () => iframe.removeEventListener('load', attach)
  }, [frameRef])

  return mountNode
}
