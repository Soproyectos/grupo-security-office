/**
 * Formateo de dinero SOLO DE PRESENTACIÓN. Los valores llegan del backend
 * como string (Decimal serializado); esta función los formatea para mostrar
 * y NUNCA se usa para calcular totales (toda la aritmética de dinero vive
 * en el backend; aquí no se suma, multiplica ni redondea nada).
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'COP'
): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(num)) return String(value)
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${currency} ${value}`
  }
}
