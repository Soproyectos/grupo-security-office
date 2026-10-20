/** Maximum number of tokens a spec label shows. */
export const MAX_SPEC_HIGHLIGHTS = 3

const DECIMAL = '\\d+(?:[.,]\\d+)?'

interface SpecRule {
  /** Rules of one group are alternatives: the first one that matches wins. */
  group: string
  pattern: RegExp
  format: (match: RegExpMatchArray) => string
}

/**
 * Ordered by how much an installer scans for it first: resolution, channels,
 * night range, lens, capacity, then electrical values. Only the first match
 * of each group is kept, so a name that repeats a value shows it once.
 */
const RULES: SpecRule[] = [
  { group: 'resolution', pattern: /\b(\d{1,2})\s?(?:MP|Megap[ií]xeles?|Megapixels?)\b/i, format: (m) => `${m[1]} MP` },
  { group: 'resolution', pattern: /\b([2-8])K\b/i, format: (m) => `${m[1]}K` },
  { group: 'resolution', pattern: /\b(1080|720|960)P\b/i, format: (m) => `${m[1]}P` },
  { group: 'channels', pattern: /\b(\d{1,2})\s?(?:CH|Canales)\b/i, format: (m) => `${m[1]} CH` },
  { group: 'ir', pattern: /\bIR\s?(\d{1,3})\s?m\b/i, format: (m) => `IR ${m[1]} m` },
  {
    group: 'lens',
    pattern: new RegExp(`\\b(${DECIMAL}(?:\\s?-\\s?${DECIMAL})?)\\s?mm\\b`, 'i'),
    format: (m) => `${(m[1] ?? '').replace(/\s/g, '')} mm`,
  },
  { group: 'storage', pattern: new RegExp(`\\b(${DECIMAL})\\s?(TB|GB)\\b`, 'i'), format: (m) => `${m[1]} ${(m[2] ?? '').toUpperCase()}` },
  { group: 'kva', pattern: new RegExp(`\\b(${DECIMAL})\\s?KVA\\b`, 'i'), format: (m) => `${m[1]} kVA` },
  { group: 'va', pattern: new RegExp(`\\b(${DECIMAL})\\s?VA\\b`, 'i'), format: (m) => `${m[1]} VA` },
  { group: 'kw', pattern: new RegExp(`\\b(${DECIMAL})\\s?KW\\b`, 'i'), format: (m) => `${m[1]} kW` },
  { group: 'hp', pattern: new RegExp(`\\b(\\d+/\\d+|${DECIMAL})\\s?HP\\b`, 'i'), format: (m) => `${m[1]} HP` },
  { group: 'watts', pattern: /\b(\d{1,4})\s?W\b/i, format: (m) => `${m[1]} W` },
  { group: 'volts', pattern: /\b(\d{1,3})\s?V\b/i, format: (m) => `${m[1]} V` },
  { group: 'amp-hours', pattern: new RegExp(`\\b(${DECIMAL})\\s?AH\\b`, 'i'), format: (m) => `${m[1]} Ah` },
]

/**
 * Key specs of a product read from its name and SKU, as short tokens for the
 * "spec label" that replaces a missing photo (e.g. `8 MP`, `IR 30 m`,
 * `2.8 mm`, `3 kVA`, `4 TB`). It only reads what the text states: no token is
 * ever invented, and a product with nothing recognisable returns `[]`.
 */
export function extractSpecHighlights(name: string, sku: string): string[] {
  const text = `${name} ${sku}`
  const tokens: string[] = []
  const seenGroups = new Set<string>()

  for (const rule of RULES) {
    if (tokens.length >= MAX_SPEC_HIGHLIGHTS) break
    if (seenGroups.has(rule.group)) continue

    const match = text.match(rule.pattern)
    if (match === null) continue

    seenGroups.add(rule.group)
    const token = rule.format(match)
    if (!tokens.includes(token)) tokens.push(token)
  }

  return tokens
}
