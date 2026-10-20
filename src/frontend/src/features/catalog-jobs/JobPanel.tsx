import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { cancelJob, enqueueJob, fetchJobs, jobKeys } from './jobs-api'
import {
  isJobActive,
  progressLabel,
  scanRetryKey,
  shouldPoll,
  stateLabel,
  type CatalogJobView,
} from './jobs-model'

/**
 * CAT-07 `frontend` — trabajos del catálogo de ESTA lista. Sin reglas desde el
 * navegador: el encolado manda `scope:{mode:'filters',listaId}` y el servidor
 * materializa TODO el alcance autorizado (más allá de la página visible,
 * aceptación del contrato); el retryKey por hora hace que re-pulsar NO duplique
 * (el mismo trabajo se devuelve con `reused:true`, nunca un segundo escaneo).
 */
export function JobPanel({ listaId }: { listaId: string }) {
  const queryClient = useQueryClient()
  const jobs = useQuery({
    queryKey: jobKeys.list,
    queryFn: fetchJobs,
    refetchOnWindowFocus: false,
    // Mientras haya un trabajo vivo, el servidor lleva el progreso real.
    refetchInterval: (query) => (shouldPoll(query.state.data ?? []) ? 4000 : false),
  })

  const enqueue = useMutation({
    mutationFn: () => enqueueJob('VALIDATION_SCAN', { mode: 'filters', listaId }, scanRetryKey(listaId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKeys.list }),
  })

  const cancel = useMutation({
    mutationFn: (id: string) => cancelJob(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKeys.list }),
  })

  return (
    <div className="space-y-4" data-testid="catalog-jobs-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => enqueue.mutate()} loading={enqueue.isPending}>
          Validar todos los productos autorizados de la lista
        </Button>
        <span className="text-xs text-neutral-500">
          El escaneo cubre todo el alcance autorizado, no solo lo visible; si ya hay un
          escaneo de esta lista en la última hora se reutiliza (no se duplica el trabajo).
        </span>
      </div>

      {enqueue.isError && (
        <Alert variant="error">
          {getApiErrorMessage(enqueue.error, 'No se pudo encolar el escaneo. ¿Te falta la concesión de validar?')}
        </Alert>
      )}
      {cancel.isError && (
        <Alert variant="error">
          {getApiErrorMessage(cancel.error, 'No se pudo cancelar el trabajo (quizá ya terminó).')}
        </Alert>
      )}

      {jobs.isError && <Alert variant="error">No se pudieron cargar los trabajos.</Alert>}
      {jobs.data?.length === 0 && !jobs.isPending && (
        <p className="text-sm text-neutral-500">Sin trabajos todavía.</p>
      )}

      <ul className="space-y-2">
        {(jobs.data ?? []).map((job) => (
          <JobRow key={job.id} job={job} onCancel={(id) => cancel.mutate(id)} canceling={cancel.isPending} />
        ))}
      </ul>
    </div>
  )
}

/** Fila de un trabajo: progreso REAL derivado en el servidor, etiquetas honestas. */
export function JobRow({ job, onCancel, canceling }: { job: CatalogJobView; onCancel: (id: string) => void; canceling: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 p-3">
      <span className="font-semibold text-sm">{job.kind === 'VALIDATION_SCAN' ? 'Escaneo de validación' : job.kind}</span>
      <span className="text-sm">{stateLabel(job)}</span>
      <span className="text-xs text-neutral-500">
        {progressLabel(job)}
        {job.mine ? '' : ' · trabajo de otra persona'}
      </span>
      {isJobActive(job) && job.mine && (
        <Button variant="secondary" loading={canceling} onClick={() => onCancel(job.id)}>
          Cancelar
        </Button>
      )}
    </li>
  )
}
