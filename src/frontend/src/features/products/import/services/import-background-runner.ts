import api from '../../../../services/api'
import { useBackgroundImportStore } from '../store/backgroundImport.store'
import type { ImportProgressResult } from '../types/import.types'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 4s, no 2s: /progress está exento del límite global de peticiones
// (`@SkipThrottle` en el backend), pero sondear más rápido de lo que el
// progreso puede cambiar de verdad no aporta nada.
const POLL_INTERVAL_MS = 4000

// Si el batch sigue "processing" pasado esto, algo real se rompió (no la
// lentitud normal de un archivo grande) — se marca como fallo para que el
// widget deje de girar para siempre.
const MAX_POLL_MS = 30 * 60 * 1000

let activePollId: string | null = null

/**
 * Arranca el sondeo de una importación en segundo plano. No depende de
 * ningún componente montado: se llama una vez, en cuanto `POST execute`
 * confirma que el batch arrancó, y sigue corriendo aunque el wizard se
 * cierre o el usuario navegue a otra pantalla — el estado vive en
 * `useBackgroundImportStore`, que `BackgroundImportWidget` lee desde
 * cualquier página (montado en `AdminLayout`).
 *
 * Solo un sondeo activo a la vez: si se llama de nuevo con un importId
 * distinto, el sondeo anterior se abandona (su fetch en curso puede seguir
 * resolviendo, pero deja de escribir en el store al notar que ya no es el
 * sondeo activo).
 */
export function runImportInBackground(importId: string, fileName: string, listaId?: string): void {
  const store = useBackgroundImportStore.getState()
  store.startJob(importId, fileName, listaId)
  activePollId = importId

  void pollLoop(importId)
}

/** Reanuda el sondeo de un job que ya estaba en curso (ej. tras recargar la pestaña). */
export function resumeBackgroundImportIfPending(): void {
  const job = useBackgroundImportStore.getState().job
  if (job && job.status === 'processing' && activePollId !== job.importId) {
    activePollId = job.importId
    void pollLoop(job.importId)
  }
}

async function pollLoop(importId: string): Promise<void> {
  const deadline = Date.now() + MAX_POLL_MS

  while (Date.now() < deadline) {
    // Otro job reemplazó a este (nueva importación lanzada) — dejar de escribir.
    if (activePollId !== importId) return

    let data: ImportProgressResult
    try {
      const res = await api.get<ImportProgressResult>(`/products/import/progress/${importId}`)
      data = res.data
    } catch {
      // Un fallo de red puntual del sondeo no es que la importación fallara
      // — se reintenta en el siguiente ciclo en vez de marcar todo como error.
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    if (activePollId !== importId) return

    if (data.status === 'completed') {
      useBackgroundImportStore.getState().updateJob({
        status: 'completed',
        progress: 100,
        message: data.message,
        result: data.result,
      })
      return
    }

    if (data.status === 'failed') {
      useBackgroundImportStore.getState().updateJob({
        status: 'failed',
        message: data.message || 'La importación falló',
      })
      return
    }

    useBackgroundImportStore.getState().updateJob({
      progress: data.progress,
      message: data.message,
    })

    await sleep(POLL_INTERVAL_MS)
  }

  if (activePollId === importId) {
    useBackgroundImportStore.getState().updateJob({
      status: 'failed',
      message:
        'La importación sigue en curso pero se agotó el tiempo de espera de esta pantalla. ' +
        'Puede seguir corriendo en el servidor.',
    })
  }
}
