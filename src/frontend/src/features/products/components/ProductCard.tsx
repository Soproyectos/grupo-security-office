import { useNavigate } from 'react-router-dom'
import type { Product } from '../types/product.types'
import { StockDot, PublishDot } from './ProductIndicators'
import { hasPermission } from '../../../lib/rbac'
import { formatCurrency } from '../../../lib/format'
import { resolveAssetUrl } from '../../../services/api'

import type { LifecycleEvent } from '../types/product.types'

interface ProductCardProps {
  product: Product
  onEdit: (product: Product) => void
  onTransition: (id: string, event: LifecycleEvent) => void
  onDelete: (id: string) => void
  onMoveCategory?: (product: Product) => void
  onAccess?: (product: Product) => void
  /** Cuando se pasa, muestra "Editar ficha" aun en modo read-only (el padre decide con products:write). */
  onEditSheet?: (id: string) => void
  /** Cuando es true, oculta todos los controles de mutación (catálogo global read-only). */
  readOnly?: boolean
}

export function ProductCard({ product, onEdit, onDelete, onMoveCategory, onAccess, onEditSheet, readOnly = false }: ProductCardProps) {
  const navigate = useNavigate()

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    navigate(`/commercial/products/${product.id}`)
  }

  return (
    <div
      className="rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer flex flex-col h-full"
      onClick={handleCardClick}
    >
      <div className="aspect-[4/3] shrink-0 overflow-hidden bg-white border-b border-gray-100 flex items-center justify-center relative">
        {product.images[0]?.url ? (
          <img
            src={resolveAssetUrl(product.images[0].url)}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-contain p-1"
          />
        ) : (
          <svg className="w-14 h-14 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )}
        {/* Actions */}
        {!readOnly && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
          {hasPermission('products:write') && onMoveCategory && (
            <button
              onClick={() => onMoveCategory(product)}
              className="p-2 bg-white rounded-lg shadow hover:bg-gray-50 text-gray-600 hover:text-security-600 transition-colors"
              title="Mover de categoría"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
          )}
          {(hasPermission('users:manage') || hasPermission('products:write')) && onAccess && (
            <button
              onClick={() => onAccess(product)}
              className="p-2 bg-white rounded-lg shadow hover:bg-violet-50 text-gray-600 hover:text-violet-600 transition-colors"
              title="Asignar accesos"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          )}
          {hasPermission('products:write') && (
            <button
              onClick={() => onEdit(product)}
              className="p-2 bg-white rounded-lg shadow hover:bg-gray-50 text-gray-600 hover:text-security-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
        )}
      </div>
      <div className="p-3 flex flex-col grow text-left">
        {/* Grupo de identidad: nombre, referencia (con los estados como puntos) y marca; el nombre reserva siempre 2 líneas. */}
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 break-words min-h-[2.75em]" title={product.name}>{product.name}</h3>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] text-gray-500 font-mono" title={product.sku}>{product.sku}</p>
            <span className="flex shrink-0 items-center">
              <StockDot product={product} />
              <PublishDot product={product} />
            </span>
          </div>
          <p className="truncate text-[11px] text-gray-400" title={product.brand?.name ?? undefined}>
            {product.brand?.name ?? ' '}
          </p>
        </div>
        {/* Precio y acción: siempre pegados al borde inferior para que todas las tarjetas alineen igual. */}
        <div className="mt-auto pt-3 flex items-center justify-between gap-2 min-h-[2.75rem]">
          {product.prices[0] ? (
            <p className="text-base font-bold text-security-700">
              {formatCurrency(product.prices[0].value, product.prices[0].currency)}
            </p>
          ) : (
            <span className="inline-block text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
              Sin precio
            </span>
          )}
          <div className="flex items-center gap-2">
          {onEditSheet && (
            <button
              type="button"
              onClick={() => onEditSheet(product.id)}
              className="px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] border border-[var(--color-border)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              Editar ficha
            </button>
          )}
          {!readOnly && hasPermission('products:delete') && (
            <button
              onClick={() => {
                if (confirm('¿Eliminar este producto?')) {
                  onDelete(product.id)
                }
              }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
