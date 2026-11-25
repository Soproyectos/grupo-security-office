import { MAX_COMPARED_PRODUCTS, useProductComparison } from '../hooks/useProductComparison'

export const COMPARE_PRODUCTS_PATH = '/clientes/comparar'
const control = 'inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

export function CompareProductButton({ id, name }: { id: string; name: string }) {
  const selected = useProductComparison((state) => state.items.some((item) => item.id === id))
  const full = useProductComparison((state) => state.items.length >= MAX_COMPARED_PRODUCTS)
  const toggle = useProductComparison((state) => state.toggle)

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Comparar ${name}`}
      disabled={!selected && full}
      title={!selected && full ? 'Quita un equipo de la comparación para agregar otro.' : undefined}
      onClick={() => toggle({ id, name })}
      className={`${control} border border-neutral-300 text-storefront-ink hover:bg-neutral-100 disabled:text-neutral-600 disabled:opacity-75 aria-pressed:border-security-600 aria-pressed:bg-security-50 aria-pressed:text-security-700`}
    >
      {selected ? 'Seleccionado' : 'Añadir'}
    </button>
  )
}

