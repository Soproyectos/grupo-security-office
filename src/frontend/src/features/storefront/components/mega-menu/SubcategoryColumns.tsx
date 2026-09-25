import { Link } from 'react-router-dom'
import { categoryHref } from './menu-model'
import type { MenuCategory } from '../../types/categoryMenu'

export interface SubcategoryColumnsProps {
  root: MenuCategory | null
  onNavigate: () => void
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Columns of the selected root: one column per level-2 category, with its
 * level-3 categories as links underneath. Level-2 headers are the way into the
 * category page, level-3 items only point at leaves.
 */
export default function SubcategoryColumns({ root, onNavigate }: SubcategoryColumnsProps) {
  if (root === null || root.children.length === 0) return null

  return (
    <ul role="list" aria-label={`Categorías de ${root.name}`} className="grid grid-cols-5 gap-x-8 gap-y-6">
      {root.children.map((column) => (
        <li key={column.id} className="min-w-0">
          <Link
            to={categoryHref(column.slug)}
            onClick={onNavigate}
            className="flex items-center gap-1 text-sm font-bold text-security-500 transition hover:text-security-600"
          >
            <span className="truncate">{column.name}</span>
            <ChevronRight />
          </Link>
          {column.children.length > 0 && (
            <ul role="list" className="mt-2 space-y-1.5">
              {column.children.map((leaf) => (
                <li key={leaf.id}>
                  <Link
                    to={categoryHref(leaf.slug)}
                    onClick={onNavigate}
                    title={leaf.name}
                    className="block truncate text-sm text-ink-600 transition hover:text-security-500"
                  >
                    {leaf.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
