import {
  Children,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { Popover } from '@base-ui/react/popover'
import { Button } from '../ui'

export type SearchFilterChip = {
  id: string
  label: string
  onRemove: () => void
}

export type SidebarAccordionId =
  | 'categories'
  | 'brands'
  | 'lifecycle'
  | 'status'
  | 'entities'
  | 'actions'

export type SidebarFilterSection = {
  id: SidebarAccordionId
  label: string
  content: ReactNode
  /** Si esta seccion tiene algun filtro activo (muestra un punto en el chip movil). */
  isActive?: boolean
}

export type SearchFilterBarProps = {
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder: string
    ariaLabel: string
  }
  activeFilterCount: number
  activeFilterChips: SearchFilterChip[]
  onClearFilters: () => void
  clearFiltersDisabled?: boolean
  /** Contenido del panel/lectora; en overlay. En sidebar se ignora en favor de `sidebarContent`. */
  children?: ReactNode
  layout?: 'overlay' | 'sidebar'
  /** Contenido de resultados (columna derecha en desktop, flujo en móvil). */
  content?: ReactNode
  /** Contenido de filtros (sidebar desktop / drawer móvil). [DEPRECATED] Usar sidebarSections en su lugar. */
  sidebarContent?: ReactNode
  /** Secciones de filtros para el sidebar, con ID, label y contenido explícito. */
  sidebarSections?: SidebarFilterSection[]
}

const SIDEBAR_ACCORDIONS = [
  { id: 'categories', label: 'Categorías' },
  { id: 'brands', label: 'Marcas' },
  { id: 'lifecycle', label: 'Estado' },
] as const

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
      />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M4 6h16M7 12h10m-7 6h4"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m6 6 12 12M18 6 6 18"
      />
    </svg>
  )
}

function ChevronDownIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
    </svg>
  )
}

function viewportIsDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 1024px)').matches
  )
}

export function SearchFilterBar({
  search,
  activeFilterCount,
  activeFilterChips,
  onClearFilters,
  clearFiltersDisabled = false,
  children,
  layout = 'overlay',
  content,
  sidebarContent,
  sidebarSections,
}: SearchFilterBarProps) {
  const [isDesktop, setIsDesktop] = useState(viewportIsDesktop)
  const [isOpen, setIsOpen] = useState(() => layout === 'sidebar' && viewportIsDesktop())
  const [accordionState, setAccordionState] = useState<Record<SidebarAccordionId, boolean>>({
    categories: true,
    brands: false,
    lifecycle: false,
    status: false,
    entities: true,
    actions: false,
  })

  const panelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  const closeOpenPanel = (restoreFocus = false) => {
    setIsOpen(false)

    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
      })
    }
  }

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    // En desktop con sidebar no se cierra por Escape ni clic exterior.
    if (layout === 'sidebar' && isDesktop) return
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeOpenPanel(true)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        closeOpenPanel(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [layout, isDesktop, isOpen])

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    search?.onChange(event.target.value)
  }

  const handleClearFilters = () => {
    onClearFilters()
    // En modo overlay/overlay móvil se cierra el panel; el sidebar desktop se mantiene.
    if (layout !== 'sidebar') closeOpenPanel(true)
  }

  // Usar sidebarSections si está disponible, de lo contrario usar sidebarContent (legacy)
  const sectionsToRender = sidebarSections ?? (() => {
    const legacySections = Children.toArray(sidebarContent)
    if (legacySections.length === 0) return undefined

    return SIDEBAR_ACCORDIONS.map((section, index) => ({
      id: section.id,
      label: section.label,
      content: legacySections[index] ?? null,
    })).filter((section) => section.content !== null) as SidebarFilterSection[]
  })()

  const accordionHeaderClass =
    'flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]'

  const renderSidebarAccordion = () => {
    if (!sectionsToRender || sectionsToRender.length === 0) {
      return null
    }

    return (
      <div className="space-y-0 divide-y divide-neutral-200">
        {sectionsToRender.map((section) => {
          const isSectionExpanded = accordionState[section.id]
          const sectionId = `${panelId}-${section.id}`

          return (
            <div key={section.id}>
              <button
                type="button"
                aria-expanded={isSectionExpanded}
                aria-controls={sectionId}
                onClick={() =>
                  setAccordionState((prev) => ({
                    ...prev,
                    [section.id]: !prev[section.id],
                  }))
                }
                className={accordionHeaderClass}
              >
                <span>{section.label}</span>
                <svg
                  className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${
                    isSectionExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
                </svg>
              </button>
              {isSectionExpanded && (
                <div id={sectionId} className="pb-4">
                  {section.content}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const isSidebar = layout === 'sidebar'

  return (
    <section
      className={isSidebar ? 'space-y-3' : 'relative space-y-3'}
      aria-label="Búsqueda y filtros"
    >
      <div
        ref={containerRef}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        {search && (
          <div className="relative min-w-0 flex-1">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              aria-hidden="true"
            >
              <SearchIcon />
            </span>

            <input
              type="search"
              value={search.value}
              onChange={handleSearchChange}
              placeholder={search.placeholder}
              aria-label={search.ariaLabel}
              className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-4 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
            />
          </div>
        )}

        {!(isSidebar && !isDesktop) && (
          <span ref={triggerRef} className={search ? 'shrink-0' : 'self-start'}>
            <Button
              type="button"
              variant="secondary"
              icon={<FilterIcon />}
              aria-expanded={isOpen}
              aria-controls={isOpen ? panelId : undefined}
              aria-haspopup={isSidebar ? 'menu' : 'dialog'}
              onClick={() => {
                if (isOpen) {
                  closeOpenPanel(false)
                  return
                }

                setIsOpen(true)
              }}
            >
              {activeFilterCount > 0
                ? `Filtros (${activeFilterCount})`
                : 'Filtros'}
            </Button>
          </span>
        )}
      </div>

      {isSidebar && !isDesktop && sectionsToRender && sectionsToRender.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtros">
          {sectionsToRender.map((section) => (
            <Popover.Root key={section.id}>
              <Popover.Trigger className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] data-[popup-open]:border-[var(--color-primary)] data-[popup-open]:text-[var(--color-primary)]">
                {section.isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                )}
                <span>{section.label}</span>
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </Popover.Trigger>

              <Popover.Portal>
                <Popover.Positioner sideOffset={8} align="start" collisionPadding={16} className="z-50">
                  <Popover.Popup className="w-[min(20rem,calc(100vw-2rem))] max-h-[60vh] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-4 shadow-xl outline-none">
                    {section.content}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          ))}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-500 underline underline-offset-2 transition-colors hover:text-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {activeFilterChips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filtros activos"
        >
          {activeFilterChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary-bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)]"
            >
              <span>{chip.label}</span>

              <button
                type="button"
                onClick={chip.onRemove}
                className="rounded-sm p-0.5 text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                aria-label={`Quitar filtro ${chip.label}`}
              >
                <CloseIcon />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 underline underline-offset-2 transition-colors hover:text-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {isSidebar ? (
        // ---------- Modo sidebar: catálogo de dos columnas ----------
        isDesktop ? (
          isOpen ? (
            <div className="lg:grid lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-6 lg:items-start">
              <aside
                id="filter-sidebar"
                role="region"
                aria-label="Filtros"
                className="w-full lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overscroll-contain rounded-xl border border-neutral-200 bg-white shadow-sm"
              >
                <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-neutral-800">
                      Filtros
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {activeFilterCount > 0
                        ? `${activeFilterCount} filtro(s) activo(s)`
                        : 'Refina los resultados sin salir del catálogo'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearFilters}
                    disabled={clearFiltersDisabled || activeFilterCount === 0}
                    className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                  >
                    Limpiar
                  </button>
                </header>

                <div className="px-5 py-4">
                  {renderSidebarAccordion()}
                </div>
              </aside>

              <div className="min-w-0">{content}</div>
            </div>
          ) : (
            <div className="min-w-0">{content}</div>
          )
        ) : (
          // En movil los filtros ya se muestran como chips con popover (arriba); aca solo va el contenido.
          <div className="min-w-0">{content}</div>
        )
      ) : (
        // ---------- Modo overlay (compatibilidad con otras páginas) ----------
        <>
          {isOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/30 lg:hidden"
                aria-label="Cerrar filtros"
                onClick={() => closeOpenPanel(true)}
              />

              <aside
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label="Filtros"
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-2xl sm:w-[24rem] lg:inset-y-auto lg:top-[max(1rem,calc((100vh-42rem)/2))] lg:right-4 lg:max-h-[calc(100vh-2rem)] lg:rounded-xl lg:border lg:shadow-xl"
              >
                <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-neutral-800">
                      Filtros
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {activeFilterCount > 0
                        ? `${activeFilterCount} filtro(s) activo(s)`
                        : 'Refina los resultados sin salir del catálogo'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      disabled={clearFiltersDisabled || activeFilterCount === 0}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                    >
                      Limpiar
                    </button>

                    <button
                      type="button"
                      onClick={() => closeOpenPanel(true)}
                      className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                      aria-label="Cerrar filtros"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                  <div className="space-y-0 divide-y divide-neutral-200">
                    {children}
                  </div>
                </div>
              </aside>
            </>
          )}
        </>
      )}
    </section>
  )
}
export default SearchFilterBar