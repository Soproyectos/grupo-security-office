import { keySpecFieldId, missingMessage } from '../lib/key-specs'
import type { MissingKeySpec } from '../types/key-specs.types'

/** Scrolls to a datum's field and puts the focus on it. */
export function goToKeySpecField(specKey: string, root: Document = document) {
  const target = root.getElementById(keySpecFieldId(specKey))
  target?.scrollIntoView?.({ block: 'center' })
  target?.focus?.({ preventScroll: true })
}

/**
 * Data the product still needs, exactly as the server lists them for its subcategory.
 * Nothing is added here: a block the template does not ask for never shows up.
 */
export function MissingKeySpecsPanel({
  missing,
  loading,
  onGo = goToKeySpecField,
}: {
  missing: MissingKeySpec[]
  loading?: boolean
  onGo?: (specKey: string) => void
}) {
  if (loading) return <div className="h-12 rounded-lg bg-neutral-100 motion-safe:animate-pulse" aria-busy="true" />
  if (missing.length === 0) {
    return (
      <p className="text-sm text-neutral-600" role="status" data-testid="missing-key-specs-empty">
        No faltan datos obligatorios.
      </p>
    )
  }
  return (
    <section aria-label="Datos que faltan" className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4" data-testid="missing-key-specs">
      <h4 className="text-sm font-semibold text-neutral-800">
        {missing.length === 1 ? 'Falta 1 dato' : `Faltan ${missing.length} datos`}
      </h4>
      <ul className="space-y-1">
        {missing.map((item) => (
          <li key={item.specKey}>
            <a
              href={`#${keySpecFieldId(item.specKey)}`}
              onClick={(event) => {
                event.preventDefault()
                onGo(item.specKey)
              }}
              className="flex min-h-[44px] flex-wrap items-center gap-x-2 rounded text-sm text-security-600 hover:text-security-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              <span className="font-medium underline">{item.label}</span>
              <span className="text-neutral-600">{missingMessage(item)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
