import { useBackgroundImportStore } from '../store/backgroundImport.store'

/**
 * Se muestra dentro del wizard, en vez del flujo normal de pasos, cuando ya
 * hay una importación corriendo en segundo plano. Sin esto, reabrir el
 * wizard mientras una importación está en curso arrancaba el flujo de
 * carga desde cero como si nada estuviera pasando — el usuario no tenía
 * forma de ver el progreso salvo la tarjeta flotante, más chica y sin la
 * opción de iniciar otra importación a propósito.
 */
export default function ImportBackgroundJobView({
  onClose,
  onStartNew,
}: {
  onClose: () => void
  onStartNew: () => void
}) {
  const job = useBackgroundImportStore((s) => s.job)

  if (!job) return null

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
      <StatusIcon status={job.status} />

      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-security-900">{titleFor(job.status)}</h2>
        <p className="mt-1 text-sm text-neutral-500">{job.fileName}</p>
        <p className="mt-2 text-sm text-gray-500">{job.message}</p>
      </div>

      {job.status === 'processing' && (
        <div className="w-full max-w-md">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-security-700 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, job.progress)}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-gray-400">{job.progress}%</p>
        </div>
      )}

      {job.status === 'completed' && job.result && (
        <div className="w-full max-w-md grid grid-cols-2 gap-3 text-left">
          <Stat label="Creados" value={job.result.summary.created} tone="success" />
          <Stat label="Actualizados" value={job.result.summary.updated} tone="neutral" />
          <Stat label="Omitidos" value={job.result.summary.skipped} tone="neutral" />
          <Stat label="Errores" value={job.result.summary.errors} tone={job.result.summary.errors > 0 ? 'error' : 'neutral'} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-lg bg-security-700 text-white text-sm font-medium hover:bg-security-800 transition-colors"
        >
          Cerrar
        </button>

        {job.status !== 'processing' && (
          <button
            type="button"
            onClick={onStartNew}
            className="px-5 py-2.5 rounded-lg border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors"
          >
            Iniciar una nueva importación
          </button>
        )}
      </div>
    </div>
  )
}

function titleFor(status: 'processing' | 'completed' | 'failed'): string {
  if (status === 'processing') return 'Ya solo falta esperar que se suban los productos'
  if (status === 'completed') return 'Importación completada'
  return 'La importación falló'
}

function StatusIcon({ status }: { status: 'processing' | 'completed' | 'failed' }) {
  if (status === 'processing') {
    return (
      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-security-50">
        <div className="w-9 h-9 border-3 border-security-700 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-green-50">
        <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-16 h-16 flex items-center justify-center rounded-full bg-security-50">
      <svg className="w-9 h-9 text-security-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'error' | 'neutral' }) {
  const toneClass =
    tone === 'success' ? 'text-green-700 bg-green-50' : tone === 'error' ? 'text-security-700 bg-security-50' : 'text-neutral-700 bg-neutral-50'

  return (
    <div className={`rounded-lg px-3 py-2 ${toneClass}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
