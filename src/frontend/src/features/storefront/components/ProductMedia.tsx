import { extractSpecHighlights } from '../utils/extractSpecHighlights'
import { productGlyphKind, type ProductGlyphKind } from '../utils/productGlyphKind'

const GLYPH_PATHS: Record<ProductGlyphKind, string[]> = {
  camera: ['M3 8h13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3z', 'M17 11l4-2v6l-4-2'],
  recorder: ['M3 8h18a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M6 12h6M18 12h.01'],
  gate: ['M3 20V8l9-5 9 5v12', 'M7 20v-8h10v8M7 16h10'],
  solar: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'],
  battery: ['M4 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M22 11v2M6 10v4M10 10v4'],
  power: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  storage: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  lock: ['M7 11h10a2 2 0 0 1 2 2v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M4 7.5l8 4.5 8-4.5M12 12v9'],
}

/** Decorative stroke icon of a product family. */
export function ProductGlyph({ kind, className = 'h-8 w-8' }: { kind: ProductGlyphKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {GLYPH_PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/**
 * "Spec label": what a product without a photo shows instead of a grey box.
 * The family icon plus the key specs read from the name and SKU, set large in
 * condensed type on the surface gradient. It is decorative (`aria-hidden`):
 * the name next to it already carries the same information for assistive
 * technology.
 */
export function ProductSpecLabel({
  name,
  sku,
  categorySlug,
  size = 'card',
  className = '',
}: {
  name: string
  sku: string
  categorySlug: string | null | undefined
  size?: 'card' | 'detail'
  className?: string
}) {
  const tokens = extractSpecHighlights(name, sku)
  const kind = productGlyphKind(categorySlug)
  const large = size === 'detail'

  return (
    <span
      aria-hidden="true"
      data-testid="spec-label"
      className={`flex h-full w-full flex-col justify-between bg-gradient-to-br from-surface-50 to-surface-200 p-4 text-ink-600 ${
        large ? 'sm:p-8' : ''
      } ${className}`}
    >
      <ProductGlyph kind={kind} className={large ? 'h-12 w-12' : 'h-8 w-8'} />
      {tokens.length > 0 && (
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-condensed font-bold leading-none text-storefront-ink">
          {tokens.map((token, index) => (
            <span
              key={token}
              className={
                index === 0
                  ? large
                    ? 'text-5xl sm:text-6xl'
                    : 'text-3xl'
                  : large
                    ? 'text-2xl sm:text-3xl'
                    : 'text-lg'
              }
            >
              {token}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
