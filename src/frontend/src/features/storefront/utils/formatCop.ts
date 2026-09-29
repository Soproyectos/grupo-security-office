/**
 * Formats a price in Colombian pesos as the storefront shows it: whole pesos,
 * dot as thousands separator and a `$` prefix (`$ 118.259`).
 *
 * The grouping is done by hand instead of `Intl.NumberFormat('es-CO')`: the
 * `es` CLDR rules skip the separator for 4-digit numbers (`4524`), which makes
 * prices of the same column look inconsistent, and the output would depend on
 * the ICU data of each runtime.
 */
export function formatCop(value: number): string {
  const rounded = Math.round(value)
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${rounded < 0 ? '-' : ''}$ ${digits}`
}
