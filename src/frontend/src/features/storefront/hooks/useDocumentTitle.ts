import { useEffect } from 'react'
import { applyDocumentTitle } from '../utils/documentTitle'

/**
 * Sets `document.title` while the page is mounted and restores the previous
 * title on unmount. Public pages use it so they never show the default title
 * of `index.html` ("Panel de Administración").
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') return
    return applyDocumentTitle(document, title)
  }, [title])
}
