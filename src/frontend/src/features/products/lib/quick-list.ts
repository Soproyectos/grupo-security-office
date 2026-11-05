import type { Product, ProductPrice } from '../types/product.types'

export interface TariffColumn {
  code: string
  name: string
}

/** Tariffs people know best come first; any other tariff follows alphabetically by name. */
const KNOWN_ORDER = ['INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA']

function rank(code: string): number {
  const index = KNOWN_ORDER.indexOf(code)
  return index === -1 ? KNOWN_ORDER.length : index
}

/** One column per tariff that appears in at least one of the given products. */
export function collectTariffColumns(products: readonly Pick<Product, 'prices'>[]): TariffColumn[] {
  const byCode = new Map<string, TariffColumn>()
  for (const product of products) {
    for (const price of product.prices ?? []) {
      const { code, name } = price.priceList
      if (!byCode.has(code)) byCode.set(code, { code, name })
    }
  }
  return [...byCode.values()].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, 'es'))
}

/**
 * Columns for the quick list: every active tariff of the catalog (even if no product on the page
 * has a price for it yet) plus any tariff that shows up in the products themselves.
 */
export function mergeTariffColumns(
  catalogTariffs: readonly { code: string; name: string; isActive?: boolean }[],
  products: readonly Pick<Product, 'prices'>[],
): TariffColumn[] {
  const byCode = new Map<string, TariffColumn>()
  for (const tariff of catalogTariffs) {
    if (tariff.isActive === false) continue
    byCode.set(tariff.code, { code: tariff.code, name: tariff.name })
  }
  for (const column of collectTariffColumns(products)) {
    if (!byCode.has(column.code)) byCode.set(column.code, column)
  }
  return [...byCode.values()].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, 'es'))
}

/** The price of a product for one tariff, or undefined when it has none. */
export function priceForTariff(product: Pick<Product, 'prices'>, code: string): ProductPrice | undefined {
  return (product.prices ?? []).find((price) => price.priceList.code === code)
}
