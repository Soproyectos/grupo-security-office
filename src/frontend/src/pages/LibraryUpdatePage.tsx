import { useHasPermission } from '../lib/rbac'
import PriceImportFlow from '../features/price-import/PriceImportFlow'

/** Pestaña Precios: exige poder revisar archivos de precios (`prices:preview`). */
export default function LibraryUpdatePage() {
  const canPreviewPrices = useHasPermission('prices:preview')
  if (!canPreviewPrices) {
    return <p className="text-sm text-[var(--color-text-secondary)]">Tu cuenta no tiene herramientas de precios disponibles.</p>
  }
  return <PriceImportFlow />
}
