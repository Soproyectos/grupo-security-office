export function getApiErrorMessage(error: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message
      if (Array.isArray(message)) return message.join(', ')
      if (typeof message === 'string') return message
    }
  }
  return fallback
}

/** Actionable hints the API may attach to an error (e.g. password policy feedback). */
export function getApiErrorFeedback(error: unknown): string[] {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data
    if (data && typeof data === 'object' && 'feedback' in data) {
      const feedback = (data as { feedback?: unknown }).feedback
      if (Array.isArray(feedback)) return feedback.filter((f): f is string => typeof f === 'string')
    }
  }
  return []
}
