import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LifecycleStatus } from '../features/products/types/product.types'
import {
  LIFECYCLE_STATUS_LABEL,
} from '../features/products/lib/lifecycle'
import { useProducts } from '../features/products/hooks/useProducts'
import { ValidationBatchButton } from '../features/catalog-validation/ValidationBatchButton'
import { PublicationBoardSection } from '../features/catalog-publication/PublicationBoardPanel'
import { ProductCard } from '../features/products/components/ProductCard'
import { ProductTableRow } from '../features/products/components/ProductTableRow'
import { ProductPagination } from '../components/ProductPagination'
import { hasRole } from '../lib/rbac'
import { ROLES } from '../lib/roles'
import { SearchFilterBar, type SearchFilterChip } from '../components/filters/SearchFilterBar'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

const LIFECYCLE_FILTER_OPTIONS: LifecycleStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
]

export default function ProductsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Batch filters state
  const [filterChips, setFilterChips] = useState({
    categoryIds: [] as string[],
    brandIds: [] as string[],
    lifecycleStatuses: [] as string[],
  })

  const filters = {
    search,
    categoryIds: filterChips.categoryIds,
    brandIds: filterChips.brandIds,
    lifecycleStatuses: filterChips.lifecycleStatuses,
    activeListaOnly: true,
  }

  const { products, categories, brands, total, isLoading } = useProducts({
    filters,
    page,
    pageSize,
  })

  const isCatalogManager = hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)

  // El backend ya filtra por productos de Listas activas (activeListaOnly),
  // asi total/totalPages quedan consistentes con lo mostrado.
  const currentProducts = products ?? []

  useEffect(() => {
    setPage(1)
  }, [search, filterChips])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const productsFilterCount =
    filterChips.categoryIds.length +
    filterChips.brandIds.length +
    filterChips.lifecycleStatuses.length

  const clearProductFilters = () => {
    setFilterChips({ categoryIds: [], brandIds: [], lifecycleStatuses: [] })
    setPage(1)
  }

  const productFilterChips: SearchFilterChip[] = [
    ...filterChips.categoryIds.map((id) => {
      const cat = categories.find((c) => c.id === id)
      return {
        id: `cat-${id}`,
        label: `Categoría: ${cat?.name ?? id}`,
        onRemove: () => {
          setFilterChips((prev) => ({ ...prev, categoryIds: prev.categoryIds.filter((c) => c !== id) }))
          setPage(1)
        },
      }
    }),
    ...filterChips.brandIds.map((id) => {
      const brand = brands.find((b) => b.id === id)
      return {
        id: `brand-${id}`,
        label: `Marca: ${brand?.name ?? id}`,
        onRemove: () => {
          setFilterChips((prev) => ({ ...prev, brandIds: prev.brandIds.filter((b) => b !== id) }))
          setPage(1)
        },
      }
    }),
    ...filterChips.lifecycleStatuses.map((status) => ({
      id: `lifecycle-${status}`,
      label: `Estado: ${LIFECYCLE_STATUS_LABEL[status as LifecycleStatus]}`,
      onRemove: () => {
        setFilterChips((prev) => ({ ...prev, lifecycleStatuses: prev.lifecycleStatuses.filter((s) => s !== status) }))
        setPage(1)
      },
    })),
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-condensed font-bold text-security-800">Productos</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Catálogo global de consulta. La creación y edición se realizan desde la Lista correspondiente.
          </p>
        </div>
        {/* CAT-05: validar el alcance mostrado (los autorizados de lo que se ve). */}
        <ValidationBatchButton productIds={currentProducts.map((p) => p.id)} />
      </div>

      {/* CAT-06: bandeja de publicación por alcance — lectura del contrato de servidor. */}
      <PublicationBoardSection />

      {/* Search and filters */}
      <SearchFilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Buscar por nombre, SKU o descripción...',
          ariaLabel: 'Buscar productos',
        }}
        activeFilterCount={productsFilterCount}
        activeFilterChips={productFilterChips}
        onClearFilters={clearProductFilters}
        clearFiltersDisabled={productsFilterCount === 0}
        layout="sidebar"
        sidebarSections={[
          {
            id: 'categories',
            label: 'Categorías',
            content: (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(categories ?? []).map((cat) => (
                  <label key={cat.id} htmlFor={`prod-cat-${cat.id}`} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      id={`prod-cat-${cat.id}`}
                      type="checkbox"
                      checked={filterChips.categoryIds.includes(cat.id)}
                      onChange={(e) => {
                        setFilterChips((prev) => ({
                          ...prev,
                          categoryIds: e.target.checked
                            ? [...prev.categoryIds, cat.id]
                            : prev.categoryIds.filter((c) => c !== cat.id),
                        }))
                      }}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-brand-primary/30 cursor-pointer"
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            ),
          },
          {
            id: 'brands',
            label: 'Marcas',
            content: (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(brands ?? []).map((brand) => (
                  <label key={brand.id} htmlFor={`prod-brand-${brand.id}`} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      id={`prod-brand-${brand.id}`}
                      type="checkbox"
                      checked={filterChips.brandIds.includes(brand.id)}
                      onChange={(e) => {
                        setFilterChips((prev) => ({
                          ...prev,
                          brandIds: e.target.checked
                            ? [...prev.brandIds, brand.id]
                            : prev.brandIds.filter((b) => b !== brand.id),
                        }))
                      }}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-brand-primary/30 cursor-pointer"
                    />
                    {brand.name}
                  </label>
                ))}
              </div>
            ),
          },
          {
            id: 'lifecycle',
            label: 'Estado',
            content: (
              <div className="space-y-2">
                {LIFECYCLE_FILTER_OPTIONS.map((status) => (
                  <label key={status} htmlFor={`prod-state-${status}`} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      id={`prod-state-${status}`}
                      type="checkbox"
                      checked={filterChips.lifecycleStatuses.includes(status)}
                      onChange={(e) => {
                        setFilterChips((prev) => ({
                          ...prev,
                          lifecycleStatuses: e.target.checked
                            ? [...prev.lifecycleStatuses, status]
                            : prev.lifecycleStatuses.filter((s) => s !== status),
                        }))
                      }}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-brand-primary/30 cursor-pointer"
                    />
                    {LIFECYCLE_STATUS_LABEL[status]}
                  </label>
                ))}
              </div>
            ),
          },
        ]}
        content={
          <>
            {/* View controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-security-500 text-white border-security-500'
                      : 'bg-white text-neutral-500 border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    viewMode === 'list'
                      ? 'bg-security-500 text-white border-security-500'
                      : 'bg-white text-neutral-500 border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
              <ProductPagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            </div>

            {/* Products grid/list */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="border border-gray-200 overflow-hidden animate-pulse">
                      <div className="aspect-square bg-gray-100"></div>
                      <div className="p-4 space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-1/3"></div>
                        <div className="h-4 bg-gray-100 rounded w-full"></div>
                        <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))
                ) : currentProducts.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p className="text-gray-500 font-medium">
                      {filterChips.lifecycleStatuses.length > 0 && (products?.length ?? 0) > 0
                        ? `No hay productos en estado ${filterChips.lifecycleStatuses.map(s => LIFECYCLE_STATUS_LABEL[s as LifecycleStatus]).join(', ')}`
                        : 'No hay productos'}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      {isCatalogManager
                        ? 'Crea productos desde una Lista para comenzar.'
                        : 'No tienes listas asignadas. Solicita acceso a tu administrador.'}
                    </p>
                  </div>
                ) : (
                  currentProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      readOnly
                      onEdit={() => {}}
                      onTransition={() => {}}
                      onDelete={() => {}}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Producto</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Precio</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Categoría</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Marca</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">Cargando...</td>
                      </tr>
                    ) : currentProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        {filterChips.lifecycleStatuses.length > 0 && (products?.length ?? 0) > 0
                          ? `No hay productos en estado ${filterChips.lifecycleStatuses.map(s => LIFECYCLE_STATUS_LABEL[s as LifecycleStatus]).join(', ')}`
                          : 'No hay productos'}
                        {!isCatalogManager && filterChips.lifecycleStatuses.length === 0 && (
                          <span className="block text-xs mt-1 text-gray-500">
                            No tienes listas asignadas. Solicita acceso a tu administrador.
                          </span>
                        )}
                      </td>
                      </tr>
                    ) : (
                      currentProducts.map((product) => (
                        <ProductTableRow
                          key={product.id}
                          product={product}
                          readOnly
                          onEdit={() => {}}
                          onTransition={() => {}}
                          onDelete={() => {}}
                          onOpen={(id) => navigate(`/commercial/products/${id}`)}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {total > 0 && (
              <ProductPagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            )}
          </>
        }
      />
    </div>
  )
}