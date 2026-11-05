export interface CategoryTreeItem {
  id: string
  name: string
  parentId?: string | null
}

/** Ordena un nivel de categorías y conserva el padre al buscar una subcategoría. */
export function categoryRows<T extends CategoryTreeItem>(categories: T[], search = ''): T[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const depthOf = (category: T) => {
    let depth = 0
    let parentId = category.parentId
    const seen = new Set([category.id])
    while (parentId && byId.has(parentId) && !seen.has(parentId) && depth < 3) {
      seen.add(parentId)
      depth += 1
      parentId = byId.get(parentId)?.parentId
    }
    if (parentId && seen.has(parentId)) return 3
    return depth
  }
  // La interfaz admite dos niveles. Datos más profundos y ciclos se exponen como
  // filas de nivel superior para que sigan siendo visibles y administrables.
  const roots = categories.filter((category) => !category.parentId || !byId.has(category.parentId) || depthOf(category) !== 1)
  const children = new Map<string, T[]>()
  categories.filter((category) => category.parentId && byId.has(category.parentId) && depthOf(category) === 1).forEach((category) => {
    const group = children.get(category.parentId!) ?? []
    group.push(category)
    children.set(category.parentId!, group)
  })
  const needle = search.trim().toLocaleLowerCase()
  return roots.flatMap((root) => {
    const kids = children.get(root.id) ?? []
    if (!needle) return [root, ...kids]
    const rootMatches = root.name.toLocaleLowerCase().includes(needle)
    const matchingKids = kids.filter((child) => child.name.toLocaleLowerCase().includes(needle))
    return rootMatches ? [root, ...kids] : matchingKids.length ? [root, ...matchingKids] : []
  })
}
