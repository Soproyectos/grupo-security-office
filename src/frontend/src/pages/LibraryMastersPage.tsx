import { Link, Navigate, useParams } from 'react-router-dom'
import { useHasAssignedAction } from '../features/users/access'
import { BrandsSection, CategoriesSection, SubcategoriesSection, TariffsSection } from '../features/masters/catalog-sections'
import DictionarySection from '../features/masters/DictionarySection'

export const MASTER_SECTIONS = [
  { slug: 'categorias', label: 'Categorías' },
  { slug: 'subcategorias', label: 'Subcategorías' },
  { slug: 'marcas', label: 'Marcas' },
  { slug: 'tarifas', label: 'Tarifas' },
  { slug: 'diccionario', label: 'Diccionario y moldes' },
] as const

export const MASTERS_BASE_PATH = '/commercial/library/masters'

export function MasterSectionBody({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  switch (slug) {
    case 'subcategorias': return <SubcategoriesSection canWrite={canWrite} />
    case 'marcas': return <BrandsSection canWrite={canWrite} />
    case 'tarifas': return <TariffsSection canWrite={canWrite} />
    case 'diccionario': return <DictionarySection canWrite={canWrite} />
    default: return <CategoriesSection canWrite={canWrite} />
  }
}

/**
 * Shell of the "Catálogos maestros" tab. Reading needs masters:read (enforced by the
 * route boundary); editing controls only render with masters:write. Each section lives in features/masters.
 */
export default function LibraryMastersPage() {
  const { section } = useParams<{ section?: string }>()
  const canWrite = useHasAssignedAction(['masters:write'])
  const current = MASTER_SECTIONS.find((item) => item.slug === section)
  if (section && !current) return <Navigate to={MASTERS_BASE_PATH} replace />
  const active = current ?? MASTER_SECTIONS[0]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-condensed text-2xl font-bold text-neutral-800">Catálogos maestros</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          {canWrite ? 'Puedes consultar y editar los catálogos maestros.' : 'Solo consulta: puedes ver los catálogos maestros, pero no editarlos.'}
        </p>
      </div>
      <nav aria-label="Secciones de catálogos maestros" className="flex flex-wrap gap-2">
        {MASTER_SECTIONS.map((item) => (
          <Link
            key={item.slug}
            to={`${MASTERS_BASE_PATH}/${item.slug}`}
            aria-current={item.slug === active.slug ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium ${item.slug === active.slug ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-neutral-300 text-neutral-700'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <section aria-label={active.label} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-base font-semibold text-neutral-800">{active.label}</h3>
        <MasterSectionBody slug={active.slug} canWrite={canWrite} />
      </section>
    </div>
  )
}
