/** Routes and return-path helpers shared by Productos, the work queue and the sheet editor. */
export const PRODUCTS_LIST_PATH = '/commercial/products'
export const LIBRARY_QUEUE_PATH = '/commercial/library/update/products'
/** Wizard that creates a draft product ("Nuevo producto"). */
export const NEW_PRODUCT_PATH = `${LIBRARY_QUEUE_PATH}/new`

/** Productos list URL; pass `location.search` to keep its filters and page. */
export function productsListPath(search = ''): string {
  return `${PRODUCTS_LIST_PATH}${search && !search.startsWith('?') ? '?' : ''}${search}`
}

export function sheetEditorPath(productId: string): string {
  return `${LIBRARY_QUEUE_PATH}/${encodeURIComponent(productId)}`
}

/** Router state the entry points pass to the editor so "Volver" can return exactly there. */
export interface SheetEditorLocationState {
  from?: string
}

export function sheetEditorState(location: { pathname: string; search: string }): SheetEditorLocationState {
  return { from: location.pathname + location.search }
}

/** Target of "Volver": the `from` an entry point passed (in-app paths only), else Productos. */
export function sheetEditorReturnPath(state: unknown, fallback = PRODUCTS_LIST_PATH): string {
  const from = (state as SheetEditorLocationState | null | undefined)?.from
  const inApp = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\')
  return inApp ? from : fallback
}
