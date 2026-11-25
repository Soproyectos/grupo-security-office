interface NavigationChange {
  navigationType: 'POP' | 'PUSH' | 'REPLACE'
  previousPath: string | null
  path: string
  hash: string
}

/**
 * A new page opens at the top. Back/forward keep the browser's own position, anchors (#section)
 * keep their jump, and changes that only touch the query (filters, pagination) stay where they are.
 */
export function shouldScrollToTop({ navigationType, previousPath, path, hash }: NavigationChange): boolean {
  if (previousPath === null || previousPath === path) return false
  if (navigationType === 'POP') return false
  return hash === ''
}
