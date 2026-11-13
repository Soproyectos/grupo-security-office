import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card } from '../components/ui'
import { ProductPagination } from '../components/ProductPagination'
import { resolveAssetUrl } from '../services/api'
import { formatCurrency } from '../lib/format'
import { useProducts } from '../features/products/hooks/useProducts'
import { getTransitionHttpStatus, useBulkTransition } from '../features/products/hooks/useProductTransition'
import { BulkPublishBar, type BulkPublishOutcome, type BulkPublishPhase } from '../features/catalog-publication/BulkPublishBar'
import { useHasPermission } from '../lib/rbac'
import { effectiveLifecycleStatus, LIFECYCLE_STATUS_LABEL } from '../features/products/lib/lifecycle'
import { NEW_PRODUCT_PATH, sheetEditorPath, sheetEditorState } from '../features/products/lib/library-nav'
import type { Product } from '../features/products/types/product.types'
import {
  buildLibraryProductQueueParams,
  parseLibraryProductQueueParams,
  type PendingFlag,
  type QueueLayout,
} from './library-product-queue-url'

const QUICK_FILTERS: readonly { id: PendingFlag; label: string }[] = [
  { id: 'noImage', label: 'Sin imagen' },
  { id: 'noBrand', label: 'Sin marca' },
  { id: 'noPrice', label: 'Sin precio' },
  { id: 'draft', label: 'Borrador' },
]

const PAGE_SIZE_OPTIONS = [20, 50, 100]

/** Computed from list fields already returned by GET /products. */
function pendingFlagsOf(product: Product): PendingFlag[] {
  const flags: PendingFlag[] = []
  if (!product.images?.some((image) => image.isPrimary && image.url) && !product.images?.some((image) => image.url)) {
    flags.push('noImage')
  }
  if (!product.brand?.name) flags.push('noBrand')
  if (!product.prices?.length) flags.push('noPrice')
  if (effectiveLifecycleStatus(product) === 'DRAFT') flags.push('draft')
  return flags
}

function lifecycleVariant(product: Product): 'success' | 'warning' | 'neutral' {
  const status = effectiveLifecycleStatus(product)
  return status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral'
}

export default function LibraryProductQueuePage() {
  const canReadPrices = useHasPermission('prices:read')
  const canCreate = useHasPermission('products:write')
  const canPublish = useHasPermission('products:publish')
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [initial] = useState(() => parseLibraryProductQueueParams(searchParams))
  const [search, setSearch] = useState(initial.search)
  const [page, setPage] = useState(initial.page)
  const [pageSize, setPageSize] = useState(initial.pageSize)
  const [layout, setLayout] = useState<QueueLayout>(initial.layout)
  const [activeFlag, setActiveFlag] = useState<PendingFlag | null>(initial.pending)
  const seenLocationKey = useRef(location.key)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkPhase, setBulkPhase] = useState<BulkPublishPhase>('idle')
  const [bulkOutcome, setBulkOutcome] = useState<BulkPublishOutcome | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkTransition = useBulkTransition()

  const filters = useMemo(() => ({ search: search.trim() }), [search])
  const { products = [], total, isLoading, error } = useProducts({ filters, page, pageSize })
  const withFlags = products.map((product) => ({ product, flags: pendingFlagsOf(product) }))
  const visible = withFlags.filter(({ flags }) => !activeFlag || flags.includes(activeFlag))
  const countOf = (flag: PendingFlag) => withFlags.filter(({ flags }) => flags.includes(flag)).length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const selectableIds = visible.filter(({ product }) => effectiveLifecycleStatus(product) === 'DRAFT').map(({ product }) => product.id)
  const selectedIds = selectableIds.filter((id) => selected.has(id))
  const nextPending = withFlags.find(({ flags }) => activeFlag ? flags.includes(activeFlag) : flags.length > 0)

  useEffect(() => {
    const next = buildLibraryProductQueueParams({ search, page, pageSize, layout, pending: activeFlag }).toString()
    if (next !== searchParams.toString()) setSearchParams(next, { replace: true })
    // The state values are the source for this URL sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize, layout, activeFlag])

  // The selection belongs to the page being shown: changing page, search or filter clears it.
  useEffect(() => {
    setSelected(new Set())
    setBulkPhase((phase) => (phase === 'confirming' ? 'idle' : phase))
  }, [search, page, pageSize, activeFlag])

  useEffect(() => {
    if (seenLocationKey.current === location.key) return
    seenLocationKey.current = location.key
    if (navigationType === 'REPLACE') return
    const restored = parseLibraryProductQueueParams(searchParams)
    setSearch(restored.search)
    setPage(restored.page)
    setPageSize(restored.pageSize)
    setLayout(restored.layout)
    setActiveFlag(restored.pending)
    // Re-read location state only on external history navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navigationType])

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const exitSelection = () => {
    setSelecting(false)
    setSelected(new Set())
    setBulkPhase('idle')
    setBulkOutcome(null)
    setBulkError(null)
  }

  const publishSelected = async () => {
    const ids = selectedIds
    setBulkError(null)
    setBulkPhase('running')
    try {
      const result = await bulkTransition.mutateAsync({ ids, event: 'PUBLISH' })
      setBulkOutcome({ requested: ids.length, applied: result.applied.length, rejected: result.rejected })
      setSelected(new Set())
      setBulkPhase('done')
    } catch (failure) {
      const status = getTransitionHttpStatus(failure)
      setBulkError(
        status === 403
          ? 'No tienes permiso para publicar productos.'
          : 'No se pudo terminar la publicación. Revisa tu conexión y la lista: los productos ya publicados no se repiten.',
      )
      setBulkPhase('idle')
    }
  }

  const openEditor = (productId: string) =>
    navigate(sheetEditorPath(productId), { state: sheetEditorState(location) })

  const retry = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['brands'] }),
    ])
  }

  const clearSearch = () => {
    setSearch('')
    setPage(1)
  }

  const loadingGrid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Cargando productos">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-neutral-200 bg-white animate-pulse">
          <div className="aspect-[16/9] bg-neutral-100" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/4 rounded bg-neutral-100" />
            <div className="h-4 w-3/4 rounded bg-neutral-100" />
            <div className="h-3 w-1/2 rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="biblioteca-queue space-y-3">

      <section className="biblioteca-queue__toolbar" aria-label="Buscar y filtrar productos">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="relative min-w-[220px] max-w-md flex-1">
            <span className="sr-only">Buscar por nombre o SKU</span>
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Buscar por nombre o SKU…"
              aria-label="Buscar por nombre o SKU"
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-10 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
            />
          </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtros rápidos sobre esta página" title={`Los conteos consideran solo los ${products.length} productos cargados en esta página.`}>
          <span className="mr-1 text-xs font-medium text-neutral-500">Falta en esta página:</span>
          {QUICK_FILTERS.map(({ id, label }) => {
            const active = activeFlag === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveFlag(active ? null : id)
                  setPage(1)
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]' : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                {label} <span className={active ? 'text-[var(--color-primary)]/70' : 'text-neutral-400'}>{countOf(id)}</span>
              </button>
            )
          })}
          {activeFlag && (
            <button type="button" onClick={() => { setActiveFlag(null); setPage(1) }} className="rounded px-2 py-1 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]">
              Quitar filtro
            </button>
          )}
        </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 gap-1" role="group" aria-label="Presentación de productos">
            <button
              type="button"
              aria-label="Ver como tarjetas"
              aria-pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${layout === 'grid' ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]' : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4ZM13 5.5A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4ZM4 14.5A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4ZM13 14.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" /></svg>
              Tarjetas
            </button>
            <button
              type="button"
              aria-label="Ver como lista"
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${layout === 'list' ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]' : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" /></svg>
              Lista
            </button>
          </div>
            {canPublish && !selecting && (
              <Button variant="secondary" className="min-h-[44px]" onClick={() => setSelecting(true)}>
                Seleccionar para publicar
              </Button>
            )}
            {canCreate && (
              <Link
                to={NEW_PRODUCT_PATH}
                state={sheetEditorState(location)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-primary)] bg-white px-4 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
              >
                Nuevo producto
              </Link>
            )}
            <Button
                      variant="primary"
                      disabled={isLoading || !nextPending}
                      onClick={() => nextPending && openEditor(nextPending.product.id)}
                    >
                      Siguiente pendiente
                    </Button>
          </div>
        </div>
      </section>

      {canPublish && selecting && (
        <BulkPublishBar
          phase={bulkPhase}
          selectedCount={selectedIds.length}
          selectableCount={selectableIds.length}
          outcome={bulkOutcome}
          errorMessage={bulkError}
          onToggleAll={(checked) => setSelected(checked ? new Set(selectableIds) : new Set())}
          onAskConfirm={() => setBulkPhase('confirming')}
          onCancelConfirm={() => setBulkPhase('idle')}
          onConfirm={() => void publishSelected()}
          onExit={exitSelection}
          editPath={sheetEditorPath}
        />
      )}

      {!isLoading && !error && total > 0 && (
        <div className="flex flex-col gap-2 border-b border-neutral-200 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600" role="status">
            {activeFlag ? `${visible.length} coincidencias de pendientes en esta página` : `${total.toLocaleString('es-CO')} ${total === 1 ? 'producto' : 'productos'} en el catálogo`}
          </p>
          <ProductPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        </div>
      )}

      {error ? (
        <Card className="space-y-3" role="alert">
          <div>
            <p className="text-sm font-semibold text-neutral-800">No se pudo cargar el catálogo</p>
            <p className="mt-1 text-sm text-neutral-500">Revisa tu conexión e intenta cargar esta página otra vez.</p>
          </div>
          <Button variant="secondary" onClick={retry}>Reintentar</Button>
        </Card>
      ) : isLoading ? (
        layout === 'grid' ? loadingGrid : (
          <div className="overflow-hidden rounded-lg border border-neutral-200" role="status" aria-label="Cargando productos">
            <div className="divide-y divide-neutral-100 animate-pulse">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 bg-neutral-50" />)}
            </div>
          </div>
        )
      ) : visible.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="font-medium text-neutral-800">
            {activeFlag ? `No hay productos con “${QUICK_FILTERS.find((filter) => filter.id === activeFlag)?.label.toLowerCase()}” en esta página` : search.trim() ? 'No se encontraron productos' : 'Aún no hay productos en el catálogo'}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {activeFlag ? 'Quita el filtro rápido para volver a ver todos los productos de la página.' : search.trim() ? 'Prueba con otro nombre o SKU.' : 'Cuando se agreguen productos, aparecerán aquí.'}
          </p>
          {(activeFlag || search.trim()) && (
            <div className="mt-4 flex justify-center gap-2">
              {activeFlag && <Button variant="secondary" onClick={() => { setActiveFlag(null); setPage(1) }}>Quitar filtro</Button>}
              {search.trim() && <Button variant="secondary" onClick={clearSearch}>Limpiar búsqueda</Button>}
            </div>
          )}
        </Card>
      ) : (
        <ul className={`biblioteca-queue__results${layout === 'grid' ? ' is-grid' : ''}`} aria-label="Fichas de productos">
          {visible.map(({ product, flags }) => {
            const image = product.images?.find((item) => item.isPrimary) ?? product.images?.[0]
            return (
              <li key={product.id} className="biblioteca-queue__row" data-selected={selecting && selected.has(product.id) ? 'true' : undefined}>
                {canPublish && selecting && (
                  effectiveLifecycleStatus(product) === 'DRAFT' ? (
                    <label className="biblioteca-queue__check">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-primary)]"
                        checked={selected.has(product.id)}
                        disabled={bulkPhase !== 'idle'}
                        onChange={(event) => toggleOne(product.id, event.target.checked)}
                        aria-label={`Seleccionar ${product.name}`}
                      />
                    </label>
                  ) : (
                    <span className="biblioteca-queue__check" aria-hidden="true" />
                  )
                )}
                <Link to={sheetEditorPath(product.id)} state={sheetEditorState(location)} className="biblioteca-queue__image" aria-label={`Abrir ficha de ${product.name}`}>
                  {image?.url ? <img src={resolveAssetUrl(image.url)} alt="" loading="lazy" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5m-9 5L3 8m9 5v9" /></svg>}
                </Link>
                <div className="biblioteca-queue__identity">
                  <h3><Link to={sheetEditorPath(product.id)} state={sheetEditorState(location)} className="hover:underline">{product.name}</Link></h3>
                  <p>{product.sku} · {product.brand?.name || 'Sin marca'} · {product.category?.name || 'Sin categoría'}</p>
                  <div className="biblioteca-queue__state" aria-label={`Estado de ${product.name}`}>
                    <Badge variant={lifecycleVariant(product)}>{LIFECYCLE_STATUS_LABEL[effectiveLifecycleStatus(product)]}</Badge>
                    {flags.filter((flag) => flag !== 'draft').map((flag) => <Badge key={flag} variant="warning">{QUICK_FILTERS.find((filter) => filter.id === flag)?.label}</Badge>)}
                  </div>
                </div>
                {canReadPrices && product.prices?.[0] && <div className="biblioteca-queue__price"><span>{product.prices[0].priceList?.name || 'Precio'}</span><strong>{formatCurrency(product.prices[0].value, product.prices[0].currency)}</strong></div>}
                <Link to={sheetEditorPath(product.id)} state={sheetEditorState(location)} className="biblioteca-queue__edit">Editar ficha<span className="sr-only"> de {product.name}</span></Link>
              </li>
            )
          })}
        </ul>
      )}

      {!isLoading && !error && total > 0 && (
        <ProductPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      )}
    </div>
  )
}
