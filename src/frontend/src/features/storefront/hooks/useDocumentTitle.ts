import { useEffect } from 'react'
import { applyDocumentTitle } from '../utils/documentTitle'

/**
 * Sets `document.title` while the page is mounted and restores the previous
 * title on unmount, which keeps titles scoped to the active page.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') return
    return applyDocumentTitle(document, title)
  }, [title])
}
