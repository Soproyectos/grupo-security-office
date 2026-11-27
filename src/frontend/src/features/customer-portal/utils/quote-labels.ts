import { isAxiosError } from 'axios'

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada a tu asesor',
  negociacion: 'En revisión',
  ganada: 'Aceptada',
  perdida: 'No concretada',
  cancelada: 'Cancelada',
  vencida: 'Vencida',
}

export function quoteStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? 'En proceso'
}

/** Short date for lists and history (dd/mm/aaaa, Bogotá). Invalid input renders empty. */
export function formatQuoteDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' }).format(date)
}

/** Message the server sent (string or list of validation messages); falls back to a recoverable generic text. */
export function quoteServerMessage(error: unknown): string {
  const fallback = 'No pudimos enviar tu cotización. Revisa tu conexión e inténtalo de nuevo.'
  if (!isAxiosError(error)) return fallback
  if (!error.response) return fallback
  const data = (error.response.data ?? {}) as { code?: unknown; message?: unknown }
  if (data.code === 'ACCOUNT_PENDING') return 'Tu cuenta está en revisión. Un asesor te contactará pronto.'
  if (error.response.status === 429) return 'Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo.'
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  if (Array.isArray(data.message) && typeof data.message[0] === 'string') return data.message[0]
  return fallback
}
