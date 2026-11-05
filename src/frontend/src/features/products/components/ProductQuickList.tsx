import type { Product } from '../types/product.types'
import { formatCurrency } from '../../../lib/format'
import { collectTariffColumns, priceForTariff, type TariffColumn } from '../lib/quick-list'

interface ProductQuickListProps {
  products: readonly Product[]
  isLoading?: boolean
  emptyMessage?: string
  /** Tariff columns to show; when omitted they are taken from the products' own prices. */
  tariffs?: readonly TariffColumn[]
  onOpen: (id: string) => void
}

const SKELETON_ROWS = 8

// Referencia (w-36 = 144px) and Nombre stay pinned while the price columns scroll sideways.
const STICKY_REF = 'sticky left-0 z-10'
const STICKY_NAME = 'sticky left-36 z-10 border-r border-gray-200'

/**
 * Quick price list: one dense row per product (reference, name; no photo) and one
 * column per tariff, so every price of a product is readable at a glance.
 * Below `md` each product becomes a compact block instead of a sideways-scrolling table.
 */
export function ProductQuickList({ products, isLoading = false, emptyMessage = 'No hay productos', tariffs, onOpen }: ProductQuickListProps) {
  const columns = tariffs ?? collectTariffColumns(products)

  if (isLoading) return <QuickListSkeleton columns={columns} />
  if (products.length === 0) return <p className="px-4 py-10 text-center text-sm text-gray-400">{emptyMessage}</p>

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] table-fixed text-[13px]" aria-label="Lista rápida de precios">
          <colgroup>
            <col className="w-36" />
            <col className="w-72" />
            {columns.map((column) => (
              <col key={column.code} className="w-36" />
            ))}
          </colgroup>
          <thead className="bg-gray-50 text-xs font-semibold leading-tight text-gray-600">
            <tr>
              <th scope="col" className={`${STICKY_REF} bg-gray-50 px-3 py-2 text-left align-bottom`}>Referencia</th>
              <th scope="col" className={`${STICKY_NAME} bg-gray-50 px-3 py-2 text-left align-bottom`}>Nombre</th>
              {columns.map((column) => (
                <th key={column.code} scope="col" className="break-words px-3 py-2 text-right align-bottom">{column.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((product) => (
              <tr key={product.id} className="group odd:bg-white even:bg-gray-50 hover:bg-[var(--color-primary-bg-subtle)]">
                <th
                  scope="row"
                  className={`${STICKY_REF} truncate bg-inherit px-3 py-1.5 text-left font-mono text-xs font-normal text-gray-500`}
                  title={product.sku}
                >
                  {product.sku}
                </th>
                <td className={`${STICKY_NAME} bg-inherit px-3 py-1.5`}>
                  <button
                    type="button"
                    onClick={() => onOpen(product.id)}
                    className="block w-full truncate rounded text-left font-medium text-gray-800 hover:text-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                    title={product.name}
                  >
                    {product.name}
                  </button>
                </td>
                {columns.map((column) => {
                  const price = priceForTariff(product, column.code)
                  return (
                    <td key={column.code} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-800">
                      {price ? formatCurrency(price.value, price.currency) : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-gray-100 md:hidden" aria-label="Lista rápida de precios">
        {products.map((product) => {
          const prices = columns
            .map((column) => ({ column, price: priceForTariff(product, column.code) }))
            .filter((entry) => entry.price)
          return (
            <li key={product.id} className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => onOpen(product.id)}
                className="block w-full rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
              >
                <span className="block font-mono text-[11px] text-gray-500">{product.sku}</span>
                <span className="mt-0.5 block text-sm font-medium text-gray-800">{product.name}</span>
              </button>
              {prices.length > 0 && (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  {prices.map(({ column, price }) => (
                    <div key={column.code} className="flex items-baseline justify-between gap-2">
                      <dt className="truncate text-xs text-gray-500">{column.name}</dt>
                      <dd className="whitespace-nowrap tabular-nums text-gray-800">{price ? formatCurrency(price.value, price.currency) : null}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Same shape as the table, so the page does not jump when the data arrives. */
function QuickListSkeleton({ columns }: { columns: readonly TariffColumn[] }) {
  return (
    <div role="status" aria-label="Cargando productos" className="overflow-hidden">
      <span className="sr-only">Cargando productos...</span>
      <div className="hidden bg-gray-50 px-3 py-2.5 md:block" aria-hidden="true">
        <div className="h-3 w-40 rounded bg-gray-200" />
      </div>
      <ul aria-hidden="true" className="divide-y divide-gray-100">
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <li key={row} className="flex items-center gap-4 px-3 py-2.5 motion-safe:animate-pulse">
            <div className="h-3 w-24 shrink-0 rounded bg-gray-200" />
            <div className="h-3 min-w-0 flex-1 rounded bg-gray-200" />
            {columns.slice(0, 5).map((column) => (
              <div key={column.code} className="hidden h-3 w-20 shrink-0 rounded bg-gray-200 md:block" />
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
