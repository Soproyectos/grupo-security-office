import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import type { LifecycleStatus } from '../features/products/types/product.types'
import {
  LIFECYCLE_STATUS_LABEL,
} from '../features/products/lib/lifecycle'
import { useProducts } from '../features/products/hooks/useProducts'
import { ProductCard } from '../features/products/components/ProductCard'
import { ProductQuickList } from '../features/products/components/ProductQuickList'
import { usePriceLists } from '../features/products/hooks/usePriceLists'
import { mergeTariffColumns } from '../features/products/lib/quick-list'
import { ProductPagination } from '../components/ProductPagination'
import { buildProductsListParams, parseProductsListParams } from '../features/products/lib/products-list-url'
import { SearchFilterBar, type SearchFilterChip } from '../components/filters/SearchFilterBar'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

const LIFECYCLE_FILTER_OPTIONS: LifecycleStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
]

const URL_OPTIONS = {
  pageSizes: PAGE_SIZE_OPTIONS,
  defaultPageSize: DEFAULT_PAGE_SIZE,
  lifecycleStatuses: LIFECYCLE_FILTER_OPTIONS,
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [searchParams, setSearchParams] = useSearchParams()
  // Filters and page live in the URL so links and "Volver" from the sheet editor restore them.
  const [initial] = useState(() => parseProductsListParams(searchParams, URL_OPTIONS))
  const [search, setSearch] = useState(initial.search)
  const [page, setPage] = useState(initial.page)
  const [pageSize, setPageSize] = useState(initial.pageSize)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initial.viewMode)

  // After paginating, go back to the top of the page.
  const pagedOnce = useRef(false)
  useEffect(() => {
    if (!pagedOnce.current) { pagedOnce.current = true; return }
    // Immediately and instantly: waiting for the load makes the page shrink and bounce before reaching the top.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [page, pageSize])

  // Batch filters state
  const [filterChips, setFilterChips] = useState({
    categoryIds: initial.categoryIds,
    brandIds: initial.brandIds,
    lifecycleStatuses: initial.lifecycleStatuses,
  })

  const filters = {
    search,
    categoryIds: filterChips.categoryIds,
    brandIds: filterChips.brandIds,
    lifecycleStatuses: filterChips.lifecycleStatuses,
  }

  const { products, categories, brands, total, isLoading } = useProducts({
    filters,
    page,
    pageSize,
  })

  // La biblioteca es el catalogo interno completo: no depende de Listas.
  const currentProducts = products ?? []
  const { priceLists } = usePriceLists()

  // Reset to the first page only when a filter really changes (not when it is restored from the URL).
  const filterKey = JSON.stringify([search, filterChips])
  const lastFilterKey = useRef(filterKey)
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return
    lastFilterKey.current = filterKey
    setPage(1)
  }, [filterKey])

  useEffect(() => {
    const next = buildProductsListParams({ search, page, pageSize, viewMode, ...filterChips }, DEFAULT_PAGE_SIZE).toString()
    if (next !== searchParams.toString()) setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize, viewMode, filterChips])

  // Navigation to this page while it is mounted (header search `?search=`, the Productos tab, back/forward)
  // makes the URL the truth again. Our own URL writes are REPLACE navigations and are skipped.
  const seenLocationKey = useRef(location.key)
  useEffect(() => {
    if (seenLocationKey.current === location.key) return
    seenLocationKey.current = location.key
    if (navigationType === 'REPLACE') return
    const url = parseProductsListParams(searchParams, URL_OPTIONS)
    const chips = { categoryIds: url.categoryIds, brandIds: url.brandIds, lifecycleStatuses: url.lifecycleStatuses }
    lastFilterKey.current = JSON.stringify([url.search, chips]) // keep the URL's page
    setSearch(url.search)
    setPage(url.page)
    setPageSize(url.pageSize)
    setViewMode(url.viewMode)
    setFilterChips(chips)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navigationType])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const productsFilterCount =
    filterChips.categoryIds.length +
    filterChips.brandIds.length +
    filterChips.lifecycleStatuses.length

  const clearProductFilters = () => {
    setFilterChips({ categoryIds: [], brandIds: [], lifecycleStatuses: [] })
    setSearch('')
    setPage(1)
  }

  // The search box inside this tab filters only the Biblioteca products (the top bar goes to the global search).
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
    <div className="space-y-4">
      {/* The help text lives in the Biblioteca tab strip (CommercialLayout) */}

      {/* Search and filters */}
      <SearchFilterBar
        search={{ value: search, onChange: (value) => { setSearch(value); setPage(1) }, placeholder: 'Buscar en Biblioteca por nombre, referencia o marca', ariaLabel: 'Buscar productos en Biblioteca' }}
        activeFilterCount={productsFilterCount}
        activeFilterChips={productFilterChips}
        onClearFilters={clearProductFilters}
        clearFiltersDisabled={productsFilterCount === 0 && !search.trim()}
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
        toolbarEnd={
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                aria-label="Ver como tarjetas"
                aria-pressed={viewMode === 'grid'}
                title="Ver como tarjetas"
                className={`p-2 rounded-lg border transition-colors ${
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
                aria-label="Ver como lista de precios"
                aria-pressed={viewMode === 'list'}
                title="Ver como lista de precios"
                className={`p-2 rounded-lg border transition-colors ${
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
          </>
        }
        content={
          <>
            {/* Products grid/list */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
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
                    <p className="text-gray-400 text-sm mt-1">No hay productos visibles en la Biblioteca.</p>
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
              <ProductQuickList
                products={currentProducts}
                tariffs={mergeTariffColumns(priceLists.filter((list) => list.currency === 'COP'), currentProducts)}
                isLoading={isLoading}
                emptyMessage={
                  filterChips.lifecycleStatuses.length > 0 && (products?.length ?? 0) > 0
                    ? `No hay productos en estado ${filterChips.lifecycleStatuses.map((s) => LIFECYCLE_STATUS_LABEL[s as LifecycleStatus]).join(', ')}`
                    : 'No hay productos'
                }
                onOpen={(id) => navigate(`/commercial/products/${id}`)}
              />
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
