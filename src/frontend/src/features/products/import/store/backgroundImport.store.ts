import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ImportExecutionResult } from '../types/import.types'

/**
 * Estado de la importación que corre en segundo plano, independiente del
 * wizard (`import.store.ts`). Vive en un store aparte a propósito: el
 * wizard se puede cerrar (y su store se resetea al cerrar) sin que eso
 * corte el sondeo del batch, que sigue corriendo en el servidor.
 *
 * Solo se sigue UNA importación a la vez — si el usuario lanza otra antes
 * de que la anterior termine, la nueva reemplaza el seguimiento de la
 * vieja (el batch viejo sigue corriendo en el servidor igual, solo deja de
 * mostrarse en la tarjeta flotante).
 *
 * Persistido en sessionStorage: si el usuario recarga la pestaña a mitad
 * de una importación larga, `BackgroundImportWidget` retoma el sondeo con
 * el `importId` guardado en vez de perder el rastro.
 */
export interface BackgroundImportJob {
  importId: string
  fileName: string
  /** Lista destino, si se conoce — permite invalidar sus queries específicas al terminar. */
  listaId?: string
  status: 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  result?: ImportExecutionResult
  startedAt: number
}

interface BackgroundImportStore {
  job: BackgroundImportJob | null
  startJob: (importId: string, fileName: string, listaId?: string) => void
  updateJob: (patch: Partial<BackgroundImportJob>) => void
  dismissJob: () => void
}

export const useBackgroundImportStore = create<BackgroundImportStore>()(
  persist(
    (set) => ({
      job: null,

      startJob: (importId, fileName, listaId) =>
        set({
          job: {
            importId,
            fileName,
            listaId,
            status: 'processing',
            progress: 0,
            message: 'Importación iniciada...',
            startedAt: Date.now(),
          },
        }),

      updateJob: (patch) =>
        set((state) => (state.job ? { job: { ...state.job, ...patch } } : state)),

      dismissJob: () => set({ job: null }),
    }),
    {
      name: 'gs-background-import',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
