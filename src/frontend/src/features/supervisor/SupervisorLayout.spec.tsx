import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import SupervisorLayout from './SupervisorLayout'

function render(path: string) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}><SupervisorLayout /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('supervisor navigation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'sup-demo', name: 'Supervisor de prueba', email: 'sup@example.invalid', roles: ['Supervisor'], permissions: [] },
    })
  })

  it('uses the shared tab pattern with the three pages and their routes', () => {
    const html = render('/supervisor')
    expect(html).toContain('biblioteca-workspace__bar')
    expect(html).toContain('aria-label="Espacio del Supervisor"')
    for (const href of ['/supervisor', '/supervisor/agenda', '/supervisor/requests']) expect(html).toContain(`href="${href}"`)
    for (const label of ['Mi equipo', 'Agenda', 'Solicitudes']) expect(html).toContain(label)
  })

  it('marks only the current page and shows its help text', () => {
    const agenda = render('/supervisor/agenda')
    expect(agenda).toMatch(/aria-current="page"[^>]*href="\/supervisor\/agenda"/)
    expect(agenda.match(/aria-current="page"/g)).toHaveLength(1)
    expect(agenda).toContain('Actividades del equipo por fecha.')
    expect(agenda).not.toContain('Peticiones de los supervisores.')
  })
})
