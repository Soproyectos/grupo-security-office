import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LibraryProductWizardPage from './LibraryProductWizardPage'

const render = (path = '/commercial/library/update/products/new') =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/commercial/library/update/products/new" element={<LibraryProductWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('LibraryProductWizardPage (before the first save)', () => {
  const html = render()

  it('shows the five steps and only the first one is open', () => {
    for (const label of ['1. Identidad', '2. Marca y clasificación', '3. Contenido y datos técnicos', '4. Imágenes y recursos', '5. Resumen y guardado']) {
      expect(html).toContain(label)
    }
    expect(html.match(/disabled=""[^>]*title="Primero guarda el paso 1/g)).toHaveLength(4)
  })

  it('asks for the reference as required and the name as optional', () => {
    expect(html).toContain('Referencia (obligatoria)')
    expect(html).toContain('Nombre (opcional)')
    expect(html).toContain('Guardar y crear borrador')
  })

  it('promises a draft and never offers to publish', () => {
    expect(html).toContain('Siempre queda como borrador')
    expect(html).not.toMatch(/Publicar|Despublicar/)
  })

  it('does not mount the steps that need the saved product', () => {
    expect(html).not.toContain('wizard-brand')
    expect(html).not.toContain('wizard-description')
  })
})
