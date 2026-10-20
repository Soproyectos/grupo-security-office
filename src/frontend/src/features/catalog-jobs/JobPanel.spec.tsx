import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JobPanel } from './JobPanel'
import { jobKeys } from './jobs-api'
import type { CatalogJobView } from './jobs-model'

const job = (over: Partial<CatalogJobView>): CatalogJobView => ({
  id: 'j-1',
  kind: 'VALIDATION_SCAN',
  state: 'RUNNING',
  progressDone: 2,
  progressTotal: 5,
  error: null,
  resultSummary: null,
  createdAt: '2026-10-19T10:00:00Z',
  startedAt: null,
  finishedAt: null,
  mine: true,
  ...over,
})

const render = (jobs: CatalogJobView[]) => {
  const client = new QueryClient()
  client.setQueryData(jobKeys.list, jobs)
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(JobPanel, { listaId: 'l-1' })),
  )
}

describe('JobPanel (CAT-07 frontend)', () => {
  it('muestra el escaneo vivo con su progreso derivado y ofrece cancelar', () => {
    const html = render([job({})])
    expect(html).toContain('Escaneo de validación')
    expect(html).toContain('2/5')
    expect(html).toContain('En ejecución')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Validar todos los productos autorizados de la lista')
  })

  it('un trabajo terminado NO ofrece cancelación (el servidor respondería 409)', () => {
    const html = render([job({ state: 'COMPLETED', progressDone: 5, progressTotal: 5 })])
    expect(html).toContain('Completado')
    expect(html).not.toContain('Cancelar')
  })

  it('la revocación de permisos se nombra con la etiqueta honesta de la enmienda', () => {
    const html = render([job({ state: 'CANCELLED', error: 'permission-revoked' })])
    expect(html).toContain('Cancelado: se retiraron los permisos antes de ejecutar')
  })

  it('el trabajo de otra persona se marca como ajeno y NO ofrece cancelación (la UI no asume admin)', () => {
    const html = render([job({ mine: false, state: 'QUEUED' })])
    expect(html).toContain('trabajo de otra persona')
    expect(html).not.toContain('Cancelar')
  })

  it('sin trabajos lo dice, sin inventar filas', () => {
    expect(render([])).toContain('Sin trabajos todavía')
  })
})
