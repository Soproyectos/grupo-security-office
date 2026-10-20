import api from '../../services/api'
import type { CatalogJobView } from './jobs-model'

export const jobKeys = {
  list: ['catalog-jobs'] as const,
  one: (id: string) => ['catalog-jobs', id] as const,
}

/** GET /catalog-jobs — mis trabajos (los admins ven los recientes de todos). */
export async function fetchJobs(): Promise<CatalogJobView[]> {
  const res = await api.get('/catalog-jobs')
  return (res.data ?? []) as CatalogJobView[]
}

/** GET /catalog-jobs/:id — progreso (ajeno/inexistente = 404 idéntico). */
export async function fetchJob(id: string): Promise<CatalogJobView> {
  const res = await api.get(`/catalog-jobs/${id}`)
  return res.data as CatalogJobView
}

export type JobScope =
  | { mode: 'ids'; ids: string[] }
  | { mode: 'filters'; listaId?: string; search?: string; lifecycleStatus?: string }

/** POST /catalog-jobs — encolar; `reused:true` si el retryKey ya existía. */
export async function enqueueJob(
  kind: 'VALIDATION_SCAN',
  scope: JobScope,
  retryKey: string,
): Promise<{ job: CatalogJobView; reused: boolean }> {
  const res = await api.post('/catalog-jobs', { kind, scope, retryKey })
  return res.data as { job: CatalogJobView; reused: boolean }
}

/** POST /catalog-jobs/:id/cancel — cooperativo; terminado → 409 job-state-conflict. */
export async function cancelJob(id: string): Promise<CatalogJobView> {
  const res = await api.post(`/catalog-jobs/${id}/cancel`)
  return res.data as CatalogJobView
}
