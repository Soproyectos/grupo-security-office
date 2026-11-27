import type { PortalMunicipality } from '../types/customer-portal.types'

export const CITY_REQUIRED_MESSAGE = 'Elige tu ciudad de la lista'
export const MUNICIPALITY_RESULT_LIMIT = 40

/** "Pereira · Risaralda" */
export function municipalityLabel(municipality: Pick<PortalMunicipality, 'name' | 'department'>): string {
  return `${municipality.name} · ${municipality.department}`
}

/** Lowercase, no accents: "bogota" finds "Bogotá". */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Municipalities whose name or department contains every typed word; names that start with the text come first. */
export function filterMunicipalities(list: readonly PortalMunicipality[], query: string, limit = MUNICIPALITY_RESULT_LIMIT): PortalMunicipality[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return list.slice(0, limit)
  const starts: PortalMunicipality[] = []
  const rest: PortalMunicipality[] = []
  for (const item of list) {
    const name = normalizeSearch(item.name)
    const haystack = `${name} ${normalizeSearch(item.department)}`
    if (!words.every((word) => haystack.includes(word))) continue
    ;(name.startsWith(words[0]!) ? starts : rest).push(item)
    if (starts.length >= limit) break
  }
  return [...starts, ...rest].slice(0, limit)
}
