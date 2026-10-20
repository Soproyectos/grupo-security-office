const SITE_NAME = 'Grupo Security'

/** Title of the storefront home. */
export const HOME_TITLE = `${SITE_NAME} | Seguridad electrónica al mejor precio`

/** `"<page> | Grupo Security"`; the home title when there is no page name. */
export function pageTitle(page: string | null | undefined): string {
  const name = (page ?? '').trim()
  return name === '' ? HOME_TITLE : `${name} | ${SITE_NAME}`
}

/** Minimal shape of `document` the title logic needs (eases testing). */
export interface TitleTarget {
  title: string
}

/**
 * Sets the title and returns the function that puts the previous one back, so
 * leaving the storefront for the internal panel never carries a stale title.
 */
export function applyDocumentTitle(target: TitleTarget, title: string): () => void {
  const previous = target.title
  target.title = title
  return () => {
    target.title = previous
  }
}
