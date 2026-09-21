import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useBackgroundImportStore } from '../store/backgroundImport.store'
import { resumeBackgroundImportIfPending } from '../services/import-background-runner'

/**
 * Tarjeta flotante con el progreso de la importación en curso, visible en
 * cualquier pantalla (montada una vez en `AdminLayout`, no dentro del
 * wizard). SEC-IMPORT-003: reemplaza la barra de progreso que bloqueaba el
 * modal del wizard — ahora el usuario cierra el wizard apenas el batch
 * arranca y sigue trabajando; esta tarjeta es lo único que sigue el rastro
 * del batch hasta que termina, esté donde esté el usuario en ese momento.
 */
export default function BackgroundImportWidget() {
  const job = useBackgroundImportStore((s) => s.job)
  const dismissJob = useBackgroundImportStore((s) => s.dismissJob)
  const queryClient = useQueryClient()

  // Si la pestaña se recargó a mitad de una importación, retoma el sondeo
  // (el store persiste el job en sessionStorage, pero el bucle de sondeo en
  // sí no sobrevive una recarga — hay que rearrancarlo).
  useEffect(() => {
    resumeBackgroundImportIfPending()
  }, [])

  // Al completarse, refresca los datos que la importación pudo haber
  // cambiado. Vive aquí (no en el wizard) porque es el único lugar que
  // conoce el momento real de finalización — puede ser minutos después de
  // que el wizard se cerró.
  useEffect(() => {
    if (job?.status !== 'completed') return
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['listas'] })
    if (job.listaId) {
      queryClient.invalidateQueries({ queryKey: ['lista-products', job.listaId] })
      queryClient.invalidateQueries({ queryKey: ['lista-prices', job.listaId] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status])

  if (!job) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 w-full max-w-sm">
      <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <StatusIcon status={job.status} />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-neutral-800 truncate">{job.fileName}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{job.message}</p>

            {job.status === 'processing' && (
              <div className="mt-2 w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-security-700 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, job.progress)}%` }}
                />
              </div>
            )}

            {job.status === 'completed' && job.result && (
              <p className="mt-1 text-xs text-neutral-600">
                {job.result.summary.created} creados · {job.result.summary.updated} actualizados
                {job.result.summary.errors > 0 && (
                  <span className="text-security-700"> · {job.result.summary.errors} con error</span>
                )}
              </p>
            )}
          </div>

          {job.status !== 'processing' && (
            <button
              type="button"
              onClick={dismissJob}
              className="shrink-0 p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: 'processing' | 'completed' | 'failed' }) {
  if (status === 'processing') {
    return (
      <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-security-50">
        <div className="w-4 h-4 border-2 border-security-700 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-green-50">
        <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }

  return (
    <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-security-50">
      <svg className="w-4 h-4 text-security-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  )
}
