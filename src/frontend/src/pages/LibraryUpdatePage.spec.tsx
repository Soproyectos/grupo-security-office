import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LibraryUpdatePage from './LibraryUpdatePage'
import { useAuthStore } from '../stores/auth.store'

function render(permissions: string[]) {
  const session = {
    isAuthenticated: true,
    user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles: ['Consulta'], permissions },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LibraryUpdatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LibraryUpdatePage', () => {
  it('con prices:preview muestra el flujo de precios directamente, sin tarjeta ni modal', () => {
    const html = render(['prices:read', 'prices:preview'])
    expect(html).toContain('Descargar plantilla')
    expect(html).toContain('Revisar archivo')
    expect(html).not.toContain('Carga de precios')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('href="/commercial/lists"')
    expect(html).not.toContain('Abrir Listas')
  })

  it('sin prices:preview oculta la carga de precios y tampoco enlaza a Listas', () => {
    const html = render([])
    expect(html).not.toContain('Descargar plantilla')
    expect(html).not.toContain('href="/commercial/lists"')
    expect(html).toContain('no tiene herramientas de precios')
  })

  it('solo Fichas (products:write, sin prices:preview) no abre la carga de precios', () => {
    const html = render(['products:read', 'products:write', 'prices:read'])
    expect(html).not.toContain('Descargar plantilla')
    expect(html).not.toContain('Revisar archivo')
    expect(html).toContain('no tiene herramientas de precios')
  })
})
