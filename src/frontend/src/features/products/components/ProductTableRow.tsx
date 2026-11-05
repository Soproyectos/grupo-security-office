import type { Product, LifecycleEvent } from '../types/product.types'
import { LIFECYCLE_STATUS_LABEL, effectiveLifecycleStatus } from '../lib/lifecycle'
import { ProductStatusBadge } from './ProductStatusBadge'
import { ProductIndicators } from './ProductIndicators'
import { hasPermission } from '../../../lib/rbac'
import { formatCurrency } from '../../../lib/format'
import { resolveAssetUrl } from '../../../services/api'

interface ProductTableRowProps {
  product: Product
  onEdit: (product: Product) => void
  onTransition: (id: string, event: LifecycleEvent) => void
  onDelete: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  accessRestrictedIds?: Set<string>
  accessUnavailable?: boolean
  onMoveCategory?: (product: Product) => void
  onAccess?: (product: Product) => void
  /** En modo read-only, callback para navegar al detalle de solo lectura. */
  onOpen?: (id: string) => void
  /** Cuando se pasa, muestra "Editar ficha" aun en modo read-only (el padre decide con products:write). */
  onEditSheet?: (id: string) => void
  /** Cuando es true, oculta todos los controles de mutación (catálogo global read-only). */
  readOnly?: boolean
}

export function ProductTableRow({
  product,
  onEdit,
  onDelete,
  selected = false,
  onToggleSelect,
  accessRestrictedIds,
  accessUnavailable,
  onMoveCategory,
  onAccess,
  onOpen,
  onEditSheet,
  readOnly = false,
}: ProductTableRowProps) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {onToggleSelect && (
        <td className="px-6 py-4">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(product.id)}
            aria-label={`Seleccionar ${product.name}`}
            className="h-4 w-4 accent-security-500 cursor-pointer"
          />
        </td>
      )}
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
            {product.images[0]?.url ? (
              <img src={resolveAssetUrl(product.images[0].url)} alt={product.name} className="w-10 h-10 object-cover" />
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{product.name}</p>
            <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        {product.prices[0] ? (
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(product.prices[0].value, product.prices[0].currency)}
          </span>
        ) : (
          <span className="text-xs text-amber-600 font-medium">Sin precio</span>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-gray-600">{product.category?.name}</td>
      <td className="px-6 py-4 text-sm text-gray-600">{product.brand?.name}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <ProductStatusBadge
            label={LIFECYCLE_STATUS_LABEL[effectiveLifecycleStatus(product)]}
            className={`px-2 py-1 text-xs font-medium rounded ${
              effectiveLifecycleStatus(product) === 'PUBLISHED'
                ? 'bg-emerald-100 text-emerald-700'
                : effectiveLifecycleStatus(product) === 'ARCHIVED'
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-amber-100 text-amber-700'
            }`}
          />
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <ProductIndicators
            product={product}
            restricted={accessRestrictedIds?.has(product.id)}
            accessUnavailable={accessUnavailable}
          />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1">
          {readOnly && onOpen && (
            <button
              onClick={() => onOpen(product.id)}
              className="px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              Ver
            </button>
          )}
          {onEditSheet && (
            <button
              type="button"
              onClick={() => onEditSheet(product.id)}
              className="px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] border border-[var(--color-border)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              Editar ficha
            </button>
          )}
          {!readOnly && hasPermission('products:write') && onMoveCategory && (
            <button
              onClick={() => onMoveCategory(product)}
              className="p-2 text-gray-400 hover:text-security-600 hover:bg-security-50 rounded-lg transition-colors"
              title="Mover de categoría"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
          )}
          {!readOnly && (hasPermission('users:manage') || hasPermission('products:write')) && onAccess && (
            <button
              onClick={() => onAccess(product)}
              className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
              title="Asignar accesos"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          )}
          {!readOnly && hasPermission('products:write') && (
            <button
              onClick={() => onEdit(product)}
              className="p-2 text-gray-400 hover:text-security-600 hover:bg-security-50 rounded-lg transition-colors"
              title="Editar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {!readOnly && hasPermission('products:delete') && (
            <button
              onClick={() => {
                if (confirm('¿Eliminar este producto?')) {
                  onDelete(product.id)
                }
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
