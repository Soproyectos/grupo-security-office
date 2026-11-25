import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ProductPagination } from '../../../components/ProductPagination'
import { SearchFilterBar, type SearchFilterChip, type SidebarFilterSection } from '../../../components/filters/SearchFilterBar'
import { fetchPublicBrands, fetchPublicKeySpecFacets, fetchPublicRequirements, type PublicRequirementsResult } from '../../../services/public-catalog.service'
import ParameterRequirements from './ParameterRequirements'
import { PUBLIC_SUBCATEGORY_PAGE_SIZES, readPublicProductPage, usePublicProductPage } from '../hooks/usePublicProductPage'
import type { MenuCategory } from '../types/categoryMenu'
import { PublicProductGrid, PublicProductGridSkeleton, PublicProductListingError } from './PublicProductGrid'
import { categoryNodeHref, productCountLabel } from './mega-menu/menu-model'

const MAX_SEARCH_LENGTH = 100
const MAX_SPEC_FILTERS = 10

/** Adds or removes one requirement, keeping the others and the order; never exceeds `max`. */
export function toggleRequirementParams(current: URLSearchParams, filter: string, max = MAX_SPEC_FILTERS): URLSearchParams {
  const next = new URLSearchParams(current)
  const selected = new Set([...new Set(current.getAll('requirement'))].slice(0, max))
  if (!selected.delete(filter) && selected.size < max) selected.add(filter)
  next.delete('requirement')
  for (const raw of selected) next.append('requirement', raw)
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** HTTP status of a failed request, when the error carries one. */
function responseStatus(error: unknown): number | undefined {
  if (!isRecord(error) || !isRecord(error.response)) return undefined
  return typeof error.response.status === 'number' ? error.response.status : undefined
}

interface RequirementsPanelContentProps {
  isPending: boolean
  isError: boolean
  error: unknown
  data: PublicRequirementsResult | undefined
  selected: readonly string[]
  onToggle: (filter: string) => void
  onClear: () => void
  onRetry: () => void
}

const LINK_BUTTON = 'block min-h-11 rounded-control font-semibold text-security-600 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-security-500'

/** Body of the "Requisitos técnicos" section: loading, error with retry, or the checklist. */
export function RequirementsPanelContent({ isPending, isError, error, data, selected, onToggle, onClear, onRetry }: RequirementsPanelContentProps) {
  if (isPending) {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">Cargando requisitos técnicos</span>
        {[0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="h-8 animate-pulse rounded-control bg-surface-200" />)}
      </div>
    )
  }
  if (isError) {
    return (
      <div role="alert" className="space-y-2 text-sm text-ink-600">
        {responseStatus(error) === 400 && selected.length > 0 ? (
          <>
            <p>Alguno de los filtros ya no está disponible.</p>
            <button type="button" onClick={onClear} className={LINK_BUTTON}>Quitar requisitos</button>
          </>
        ) : (
          <p>No pudimos cargar los requisitos técnicos.</p>
        )}
        <button type="button" onClick={onRetry} className={LINK_BUTTON}>Reintentar</button>
      </div>
    )
  }
  return <ParameterRequirements facets={data?.facets ?? []} selected={selected} maxSelections={MAX_SPEC_FILTERS} truncated={data?.truncated} onToggle={onToggle} />
}

interface SubcategoryProductsProps {
  category: MenuCategory
  subcategory?: MenuCategory
  children: MenuCategory[]
  emptyState: ReactNode
}

export default function SubcategoryProducts({ category, subcategory, children, emptyState }: SubcategoryProductsProps) {
  const [params, setParams] = useSearchParams()
  const pendingCriteria = useRef<{ base: URLSearchParams; latest: URLSearchParams } | null>(null)
  const { page, pageSize } = readPublicProductPage(params)
  const query = (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH)
  const [searchDraft, setSearchDraft] = useState(query)
  const brand = (params.get('brand') ?? '').trim().slice(0, 100)
  const subcategoryId = subcategory?.subcategoryId
  const brands = useQuery({ queryKey: ['storefront', 'public-brands'], queryFn: fetchPublicBrands, staleTime: 300_000 })
  const facetQuery = useQuery({
    queryKey: ['storefront', 'subcategory-specifications', subcategoryId],
    queryFn: () => fetchPublicKeySpecFacets(subcategoryId ?? ''),
    enabled: Boolean(subcategoryId),
  })
  const facets = (facetQuery.data?.facets ?? []).filter((facet) => facet.values.some((option) => option.count > 0))
  const rawRequirements = [...new Set(params.getAll('requirement'))].slice(0, MAX_SPEC_FILTERS)
  const rawSpecs = params.getAll('keySpec').slice(0, MAX_SPEC_FILTERS)
  const filteredSpecs = facets.flatMap((facet) => {
    const option = facet.values.find((value) => value.count > 0 && rawSpecs.includes(`${facet.specKey}:${value.value}`))
    return option ? [{ key: facet.specKey, value: option.value, label: `${facet.label}: ${option.label}` }] : []
  })
  const requirementScope = {
    q: query || undefined,
    brand: brand || undefined,
    keySpec: filteredSpecs.map(({ key, value }) => `${key}:${value}`),
    requirement: rawRequirements,
  }
  const requirements = useQuery({
    queryKey: ['storefront', 'requirements', category.slug, subcategory?.subcategorySlug ?? subcategory?.slug, requirementScope],
    queryFn: () => fetchPublicRequirements(category.slug, subcategory?.subcategorySlug ?? subcategory?.slug, requirementScope),
    staleTime: 60_000,
  })
  const waitingForSpecs = Boolean(subcategoryId && rawSpecs.length > 0 && facetQuery.isPending)
  const failedSpecs = Boolean(subcategoryId && rawSpecs.length > 0 && facetQuery.isError)
  const products = usePublicProductPage(
    {
      category: category.slug,
      subcategory: subcategory?.subcategorySlug ?? subcategory?.slug,
      ...requirementScope,
    },
    page,
    pageSize,
    !waitingForSpecs && !failedSpecs && !(rawRequirements.length > 0 && requirements.isPending),
  )
  const total = products.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => setSearchDraft(query), [query])
  useEffect(() => {
    const search = searchDraft.trim()
    if (search === query) return
    const timer = window.setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (search) next.set('q', search)
        else next.delete('q')
        next.delete('page')
        return next
      }, { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, searchDraft, setParams])

  useEffect(() => {
    if (!products.isSuccess || page <= totalPages) return
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (totalPages > 1) next.set('page', String(totalPages))
      else next.delete('page')
      return next
    }, { replace: true })
  }, [page, products.isSuccess, setParams, totalPages])

  function updateCriteria(edit: (next: URLSearchParams) => void) {
    // Apply fast successive clicks to the latest draft until the router commits a new URL.
    const pending = pendingCriteria.current
    const next = new URLSearchParams(pending?.base === params ? pending.latest : params)
    edit(next)
    next.delete('page')
    pendingCriteria.current = { base: params, latest: next }
    setParams(next)
  }

  function clearFilters() {
    updateCriteria((next) => {
      next.delete('brand')
      next.delete('keySpec')
      next.delete('requirement')
    })
  }

  function changeSpec(specKey: string, value: string) {
    updateCriteria((next) => {
      next.delete('keySpec')
      const retained = filteredSpecs.filter((spec) => spec.key !== specKey)
      for (const spec of retained) next.append('keySpec', `${spec.key}:${spec.value}`)
      if (value) next.append('keySpec', `${specKey}:${value}`)
    })
  }

  function toggleRequirement(filter: string) {
    updateCriteria((next) => {
      const toggled = toggleRequirementParams(next, filter)
      next.delete('requirement')
      for (const raw of toggled.getAll('requirement')) next.append('requirement', raw)
    })
  }

  function clearRequirements() {
    updateCriteria((next) => next.delete('requirement'))
  }

  const chips: SearchFilterChip[] = filteredSpecs.map((spec) => ({
    id: spec.key,
    label: spec.label,
    onRemove: () => changeSpec(spec.key, ''),
  }))
  chips.push(...rawRequirements.map((raw) => {
    const separator = raw.indexOf(':')
    const key = separator > 0 ? raw.slice(0, separator) : raw
    const value = separator > 0 ? raw.slice(separator + 1) : ''
    const facet = requirements.data?.facets.find((item) => item.specKey === key)
    const option = facet?.values.find((item) => item.value === value)
    const label = facet?.label ?? key.replace(/_/g, ' ')
    return {
      id: `requirement-${raw}`,
      label: value ? `${label}: ${option?.label ?? value}` : label,
      onRemove: () => toggleRequirement(raw),
    }
  }))
  const brandOptions = brands.data ?? []
  const selectedBrand = brandOptions.find((option) => option.slug === brand)
  if (brand) {
    chips.unshift({
      id: 'brand',
      label: selectedBrand?.name ?? brand,
      onRemove: () => updateCriteria((next) => next.delete('brand')),
    })
  }

  const sections: SidebarFilterSection[] = []
  if (children.length > 0) {
    sections.push({
      id: 'categories',
      label: 'Subcategorías',
      content: (
        <ul className="space-y-1">
          {children.map((child) => (
            <li key={child.id}>
              <Link to={categoryNodeHref(child, category.slug)} className="inline-flex min-h-11 items-center rounded-control text-sm font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-security-500">
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      ),
    })
  }
  if (brandOptions.length > 0 || brand || brands.isPending || brands.isError) {
    sections.push({
      id: 'brands',
      label: 'Marcas',
      isActive: Boolean(brand),
      content: brands.isPending ? <p role="status" className="text-sm text-ink-600">Cargando marcas…</p> :
        brands.isError ? <button type="button" onClick={() => void brands.refetch()} className="min-h-11 text-sm font-semibold text-security-600 underline">Reintentar carga de marcas</button> : (
          <fieldset>
            <legend className="sr-only">Marcas</legend>
            {brand && !selectedBrand && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked onChange={() => updateCriteria((next) => next.delete('brand'))} className="size-4 accent-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-security-600" />
                <span className="break-words">{brand}</span>
              </label>
            )}
            {brandOptions.map((option) => (
              <label key={option.slug} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-1.5 py-2 text-sm hover:bg-surface-100">
                <input type="checkbox" checked={brand === option.slug}
                  onChange={() => updateCriteria((next) => brand === option.slug ? next.delete('brand') : next.set('brand', option.slug))}
                  className="size-4 shrink-0 accent-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-security-600" />
                <span className="min-w-0 break-words text-ink-800">{option.name}</span>
              </label>
            ))}
          </fieldset>
        ),
    })
  }
  if (subcategoryId && (facets.length > 0 || facetQuery.isPending || facetQuery.isError)) {
    sections.push({
      id: 'specifications',
      label: 'Especificaciones',
      isActive: filteredSpecs.length > 0,
      content: facetQuery.isPending ? <p role="status" className="text-sm text-ink-600">Cargando especificaciones…</p> :
        facetQuery.isError ? <button type="button" onClick={() => void facetQuery.refetch()} className="min-h-11 text-sm font-semibold text-security-600 underline">Reintentar carga de especificaciones</button> : (
          <ParameterRequirements
            facets={facets}
            selected={filteredSpecs.map((spec) => `${spec.key}:${spec.value}`)}
            maxSelections={MAX_SPEC_FILTERS}
            onToggle={(filter) => {
              const separator = filter.indexOf(':')
              const key = filter.slice(0, separator)
              const value = filter.slice(separator + 1)
              const selected = filteredSpecs.some((spec) => spec.key === key && spec.value === value)
              changeSpec(key, selected ? '' : value)
            }}
          />
        ),
    })
  }

  if (requirements.isPending || requirements.isError || requirements.data?.facets.length) {
    sections.push({
      id: 'requirements',
      label: 'Requisitos técnicos',
      isActive: rawRequirements.length > 0,
      content: (
        <RequirementsPanelContent
          isPending={requirements.isPending}
          isError={requirements.isError}
          error={requirements.error}
          data={requirements.data}
          selected={rawRequirements}
          onToggle={toggleRequirement}
          onClear={clearRequirements}
          onRetry={() => void requirements.refetch()}
        />
      ),
    })
  }

  function renderPagination(label: string) {
    return (
      <nav aria-label={label} className={`[&_button]:min-h-11 [&_select]:min-h-11 ${products.isSuccess && totalPages === 1 ? 'max-sm:[&_button]:hidden' : ''}`}>
        <ProductPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          pageSizeOptions={PUBLIC_SUBCATEGORY_PAGE_SIZES}
          onPageChange={(nextPage) => {
            setParams((current) => {
              const next = new URLSearchParams(current)
              if (nextPage > 1) next.set('page', String(nextPage))
              else next.delete('page')
              return next
            })
            window.scrollTo({ top: 0 })
          }}
          onPageSizeChange={(size) => updateCriteria((next) => next.set('limit', String(size)))}
        />
      </nav>
    )
  }

  const hasCriteria = Boolean(query || brand || filteredSpecs.length || rawRequirements.length)
  const data = products.data
  const content = (
    <>
      {failedSpecs ? (
        <PublicProductListingError subject="las especificaciones seleccionadas" onRetry={() => void facetQuery.refetch()} />
      ) : products.isPending || (products.isSuccess && page > totalPages) ? (
        <PublicProductGridSkeleton compact />
      ) : products.isError ? (
        <PublicProductListingError onRetry={() => void products.refetch()} />
      ) : data?.items.length ? (
        <>
          <p role="status" className="mb-3 text-sm text-ink-600">{productCountLabel(total)}</p>
          <PublicProductGrid products={data.items} compact />
          {totalPages > 1 && <div className="mt-6">{renderPagination('Paginación inferior')}</div>}
        </>
      ) : hasCriteria ? (
        <div role="status" className="rounded-card border border-surface-200 bg-white p-6 text-center">
          <h3 className="text-lg font-bold text-ink-900">No encontramos productos con estos filtros</h3>
          <button type="button" onClick={() => {
            setSearchDraft('')
            updateCriteria((next) => {
              next.delete('q')
              next.delete('brand')
              next.delete('keySpec')
              next.delete('requirement')
            })
          }} className="mt-2 min-h-11 rounded-control font-semibold text-security-600 underline">
            Limpiar búsqueda y filtros
          </button>
        </div>
      ) : emptyState}
    </>
  )

  return (
    <section aria-labelledby="categoria-productos" className="mt-5">
      <h2 id="categoria-productos" className="sr-only">Productos</h2>
      <SearchFilterBar
        layout="sidebar"
        touchFriendly
        search={{ value: searchDraft, onChange: setSearchDraft, placeholder: 'Buscar por nombre o referencia', ariaLabel: 'Buscar en esta categoría', maxLength: MAX_SEARCH_LENGTH }}
        activeFilterCount={chips.length}
        activeFilterChips={chips}
        onClearFilters={clearFilters}
        sidebarSections={sections}
        toolbarEnd={renderPagination('Paginación superior')}
        content={content}
      />
    </section>
  )
}
