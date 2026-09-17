import { Badge } from '../../../components/ui'
import {
  QUOTE_STATUS_LABELS,
  type QuoteEffectiveStatus,
} from '../types/quote.types'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const STATUS_VARIANT: Record<QuoteEffectiveStatus, BadgeVariant> = {
  borrador: 'neutral',
  enviada: 'info',
  negociacion: 'warning',
  ganada: 'success',
  perdida: 'error',
  cancelada: 'neutral',
  // Estado efectivo calculado por el backend (solo lectura, nunca se envía).
  vencida: 'error',
}

export default function QuoteStatusBadge({
  status,
}: {
  status: QuoteEffectiveStatus
}) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>
      {QUOTE_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
