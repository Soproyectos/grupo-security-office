/** Keeps an old response from replacing the result for a different file or list. */
export function createPreviewRequestGate() {
  let sequence = 0
  let controller: AbortController | undefined
  return {
    begin() {
      controller?.abort()
      controller = new AbortController()
      return { sequence: ++sequence, signal: controller.signal }
    },
    invalidate() {
      ++sequence
      controller?.abort()
    },
    isCurrent(requestSequence: number) {
      return sequence === requestSequence
    },
  }
}

export function pageItems<T>(items: T[], page: number, pageSize: 25 | 50): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export function validatePreviewFile(file: Pick<File, 'name' | 'size'> | null): string {
  if (!file) return ''
  if (!/\.xlsx$/i.test(file.name)) return 'Elige la plantilla de precios guardada como Excel (.xlsx).'
  if (file.size > 5 * 1024 * 1024) return 'El archivo supera los 5 MB. Guarda una copia más pequeña e inténtalo de nuevo.'
  return ''
}

/** Format decimal strings without losing precision by converting them to Number. */
export function formatPreviewPesos(value: string | null): string {
  if (value === null) return 'Sin precio anterior'
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return value
  const negative = value.startsWith('-')
  const [whole = '', decimals] = (negative ? value.slice(1) : value).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = decimals && /[1-9]/.test(decimals) ? `,${decimals}` : ''
  return `${negative ? '−' : ''}$${grouped}${fraction}`
}
