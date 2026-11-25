import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const MAX_COMPARED_PRODUCTS = 3

type Item = { id: string; name: string }
type Comparison = {
  items: Item[]
  toggle: (item: Item) => void
  remove: (id: string) => void
  clear: () => void
}

export const useProductComparison = create<Comparison>()(persist((set) => ({
  items: [],
  toggle: (item) => set((state) => {
    if (state.items.some(({ id }) => id === item.id)) {
      return { items: state.items.filter(({ id }) => id !== item.id) }
    }
    return state.items.length < MAX_COMPARED_PRODUCTS ? { items: [...state.items, item] } : state
  }),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] }),
}), {
  name: 'gs-product-comparison',
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({ items: state.items }),
}))
