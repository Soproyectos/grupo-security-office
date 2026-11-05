export type DetailTab = 'ficha' | 'prices' | 'stock' | 'publish' | 'audit'

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'ficha', label: 'Ficha' },
  { id: 'prices', label: 'Precios' },
  { id: 'stock', label: 'Stock' },
  { id: 'publish', label: 'Publicación' },
  { id: 'audit', label: 'Auditoría' },
]

export function visibleDetailTabs({ mode, canReadPrices }: {
  mode: 'read' | 'publication'
  canReadPrices: boolean
}): { id: DetailTab; label: string }[] {
  return TABS.filter((tab) => {
    if (tab.id === 'ficha') return true
    if (mode === 'read') return tab.id === 'prices' && canReadPrices
    return tab.id === 'publish'
  })
}
