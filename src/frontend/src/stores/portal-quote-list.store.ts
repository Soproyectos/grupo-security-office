import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const QUOTE_LIST_MAX_QUANTITY = 9999
export const QUOTE_LIST_MAX_PRODUCTS = 100

export interface QuoteListItem {
  productId: string
  sku: string
  name: string
  imageUrl: string | null
  quantity: number
}

interface QuoteListState {
  /** One list per portal account id, so two people on the same browser never share one. */
  lists: Record<string, QuoteListItem[]>
  add: (accountId: string, item: Omit<QuoteListItem, 'quantity'>, quantity?: number) => boolean
  setQuantity: (accountId: string, productId: string, quantity: number) => void
  remove: (accountId: string, productId: string) => void
  clear: (accountId: string) => void
  clearAll: () => void
}

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(QUOTE_LIST_MAX_QUANTITY, Math.max(1, Math.trunc(value)))
}

/** localStorage when the browser allows it; otherwise an in-memory store (private windows, tests, SSR). */
function browserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage } catch { /* blocked */ }
  const memory = new Map<string, string>()
  return { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value) }, removeItem: (key) => { memory.delete(key) } }
}

export const usePortalQuoteListStore = create<QuoteListState>()(
  persist(
    (set, get) => ({
      lists: {},
      add: (accountId, item, quantity = 1) => {
        const current = get().lists[accountId] ?? []
        const existing = current.find((line) => line.productId === item.productId)
        if (!existing && current.length >= QUOTE_LIST_MAX_PRODUCTS) return false
        const next = existing
          ? current.map((line) => (line.productId === item.productId ? { ...line, quantity: clampQuantity(line.quantity + quantity) } : line))
          : [...current, { ...item, quantity: clampQuantity(quantity) }]
        set({ lists: { ...get().lists, [accountId]: next } })
        return true
      },
      setQuantity: (accountId, productId, quantity) => set((state) => ({
        lists: { ...state.lists, [accountId]: (state.lists[accountId] ?? []).map((line) => (line.productId === productId ? { ...line, quantity: clampQuantity(quantity) } : line)) },
      })),
      remove: (accountId, productId) => set((state) => ({
        lists: { ...state.lists, [accountId]: (state.lists[accountId] ?? []).filter((line) => line.productId !== productId) },
      })),
      clear: (accountId) => set((state) => ({ lists: { ...state.lists, [accountId]: [] } })),
      clearAll: () => set({ lists: {} }),
    }),
    {
      name: 'gs-portal-quote-list',
      version: 1,
      storage: createJSONStorage(browserStorage),
      partialize: (state) => ({ lists: state.lists }),
    },
  ),
)

const EMPTY: QuoteListItem[] = []

/** The quote list of one account (empty when there is no account). */
export function usePortalQuoteList(accountId?: string | null) {
  const items = usePortalQuoteListStore((state) => (accountId ? state.lists[accountId] ?? EMPTY : EMPTY))
  const add = usePortalQuoteListStore((state) => state.add)
  const setQuantity = usePortalQuoteListStore((state) => state.setQuantity)
  const remove = usePortalQuoteListStore((state) => state.remove)
  const clear = usePortalQuoteListStore((state) => state.clear)
  return { items, count: items.length, add, setQuantity, remove, clear }
}
