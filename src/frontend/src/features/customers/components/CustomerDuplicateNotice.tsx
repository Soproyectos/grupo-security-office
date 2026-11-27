import type { CustomerDuplicate } from '../../../services/customers.service'

/**
 * Button that opens the customer that already exists. It only renders when the
 * server says who it is (the person may not be allowed to see that customer).
 */
export default function CustomerDuplicateNotice({
  duplicate,
  onOpenExisting,
}: {
  duplicate: CustomerDuplicate
  onOpenExisting?: (existing: { id: string; name: string }) => void
}) {
  const { existing } = duplicate
  if (!existing || !onOpenExisting) return null
  return (
    <button
      type="button"
      onClick={() => onOpenExisting(existing)}
      className="min-h-11 text-left text-sm font-medium text-brand-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
    >
      Abrir {existing.name}
    </button>
  )
}
