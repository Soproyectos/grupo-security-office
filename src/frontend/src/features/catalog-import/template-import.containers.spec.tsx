import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { BatchViewer, TemplateImportHistory, TemplateImportWizard } from './TemplateImportContainers'

describe('import containers initial render', () => {
  it('shows the six-step wizard and the existing download actions', () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><TemplateImportWizard canRun /></QueryClientProvider>)
    expect(html).toContain('Subir y validar')
    expect(html).toContain('Descargar plantilla')
    expect(html).toContain('Descargar ejemplo')
    expect(html).not.toContain('Confirmar importación')
  })
  it('shows loading while the history request is pending', () => {
    expect(renderToStaticMarkup(<TemplateImportHistory />)).toContain('Cargando historial')
  })
  it('explains that leaving the batch viewer does not stop the import', () => {
    const html = renderToStaticMarkup(<BatchViewer batchId="batch-a" />)
    expect(html).toContain('la importación sigue en segundo plano')
    expect(html).not.toContain('batch-a')
  })
})
