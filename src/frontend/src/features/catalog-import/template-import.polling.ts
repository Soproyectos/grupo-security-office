import { getBatchResults, getProgress } from './template-import.api'
import { isBatchFinished, POLL_INTERVAL_MS, shouldKeepPolling } from './template-import.helpers'
import type { BatchResults, BatchSummary } from './template-import.types'

/** One serial follow-up; stopping it never cancels the server batch. */
export function followBatch(batchId: string, callbacks: {
  onProgress: (batch: BatchSummary) => void
  onResult: (results: BatchResults) => void
  onStopped: () => void
  onError: (error: unknown) => void
}): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let polls = 0
  const tick = async () => {
    try {
      const batch = await getProgress(batchId)
      if (cancelled) return
      callbacks.onProgress(batch)
      polls += 1
      if (isBatchFinished(batch.state)) {
        const results = await getBatchResults(batchId)
        if (!cancelled) callbacks.onResult(results)
      } else if (shouldKeepPolling(batch.state, polls)) {
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
      } else {
        callbacks.onStopped()
      }
    } catch (error) {
      if (!cancelled) callbacks.onError(error)
    }
  }
  void tick()
  return () => { cancelled = true; if (timer) clearTimeout(timer) }
}
