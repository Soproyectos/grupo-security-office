import { Link } from 'react-router-dom'
import type { MenuCategory } from '../../types/categoryMenu'

export interface CategorySidebarProps {
  roots: MenuCategory[]
  selectedId: string | null
  onSelect: (rootId: string) => void
  onHover: (rootId: string) => void
  onLeave: () => void
  onKeyDown: (key: string) => void
  onNavigate: () => void
}

/**
 * The root icon is a 24px stroke SVG drawn with `currentColor`, which does not
 * cross the `<img>` boundary, so the image is used as a mask: the `<img>` keeps
 * its box for accessibility and hit testing while `bg-current` paints the shape
 * with the color of the text next to it.
 */
export function CategoryIcon({ src, className }: { src: string; className: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`bg-current ${className}`}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}

function ChevronRight({ className }: { className: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function CategorySidebar({
  roots,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onKeyDown,
  onNavigate,
}: CategorySidebarProps) {
  return (
    <ul
      role="list"
      aria-label="Categorías"
      onKeyDown={(event) => onKeyDown(event.key)}
      className="w-60 shrink-0 space-y-0.5 overflow-y-auto border-r border-surface-200 bg-surface-50 p-3 lg:w-64"
    >
      {roots.map((root) => {
        const selected = root.id === selectedId
        return (
          <li key={root.id}>
            <button
              type="button"
              data-root-id={root.id}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(root.id)}
              onMouseEnter={() => onHover(root.id)}
              onMouseLeave={onLeave}
              onFocus={() => onSelect(root.id)}
              className={`flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm transition ${
                selected
                  ? 'bg-surface-100 font-bold text-security-500'
                  : 'font-medium text-ink-600 hover:bg-surface-100 hover:text-security-500'
              }`}
            >
              {root.iconUrl ? (
                <CategoryIcon src={root.iconUrl} className="h-5 w-5 shrink-0" />
              ) : (
                <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full bg-surface-200" />
              )}
              <span className="min-w-0 flex-1 truncate">{root.name}</span>
              <ChevronRight className={`shrink-0 ${selected ? 'text-security-500' : 'text-ink-400'}`} />
            </button>
          </li>
        )
      })}
      {roots.length > 0 && (
        <li className="pt-2">
          <Link
            to="/catalogo"
            onClick={onNavigate}
            className="block rounded-control px-3 py-2 text-micro font-bold uppercase tracking-wide text-ink-500 transition hover:bg-surface-100 hover:text-security-500"
          >
            Ver todo el catálogo
          </Link>
        </li>
      )}
    </ul>
  )
}
