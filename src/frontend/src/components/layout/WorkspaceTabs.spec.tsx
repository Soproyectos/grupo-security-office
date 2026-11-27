import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import WorkspaceTabs, { type WorkspaceRouteTab, type WorkspaceTab } from './WorkspaceTabs'

const ICON = 'M4 4h6v6H4z'
const stateTabs: WorkspaceTab[] = [
  { id: 'one', label: 'Uno', icon: ICON, hint: 'Ayuda de uno.' },
  { id: 'two', label: 'Dos', icon: ICON, hint: 'Ayuda de dos.', badge: 3 },
]
const routeTabs: WorkspaceRouteTab[] = [
  { id: 'home', to: '/panel', end: true, label: 'Inicio', icon: ICON, hint: 'Ayuda de inicio.' },
  { id: 'list', to: '/panel/list', label: 'Lista', icon: ICON, hint: 'Ayuda de lista.' },
]

function renderState(activeId: string, variant?: 'workspace' | 'standalone' | 'header') {
  return renderToStaticMarkup(<WorkspaceTabs mode="state" title="Panel de prueba" navLabel="Secciones de prueba" tabs={stateTabs} activeId={activeId} onChange={() => undefined} variant={variant} />)
}
function renderRoute(path: string, variant?: 'workspace' | 'standalone' | 'header') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceTabs mode="route" title="Panel de prueba" navLabel="Navegación de prueba" tabs={routeTabs} variant={variant} trailing={<a className="biblioteca-workspace__destination" href="/extra">Extra</a>} />
    </MemoryRouter>,
  )
}

describe('WorkspaceTabs por estado', () => {
  it('pinta la barra del patrón con icono, nombre y la ayuda de la pestaña activa', () => {
    const html = renderState('one')
    expect(html).toContain('class="biblioteca-workspace__bar"')
    expect(html).toContain('<h1 class="biblioteca-workspace__label">Panel de prueba</h1>')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Secciones de prueba"')
    expect(html).toContain('<path d="M4 4h6v6H4z"></path>')
    expect(html).toContain('<p class="biblioteca-workspace__hint">Ayuda de uno.</p>')
    expect(html).not.toContain('Ayuda de dos.')
  })

  it('marca solo la pestaña activa y conserva ids y aria para el contenido', () => {
    const html = renderState('two')
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*id="tab-two"[^>]*aria-controls="panel-two"[^>]*aria-selected="true"[^>]*class="biblioteca-workspace__destination is-active"/)
    expect(html).toMatch(/id="tab-one"[^>]*aria-selected="false"[^>]*class="biblioteca-workspace__destination"/)
    expect(html).toContain('Ayuda de dos.')
  })

  it('muestra el contador solo en la pestaña que lo trae', () => {
    const html = renderState('one')
    expect(html.match(/rounded-full/g)).toHaveLength(1)
    expect(html).toContain('>3</span>')
  })

  it('en la variante workspace no envuelve la barra: la página ya es el espacio', () => {
    expect(renderState('one')).not.toContain('biblioteca-workspace--standalone')
  })
})

describe('WorkspaceTabs por ruta', () => {
  it('usa enlaces, marca la ruta activa con aria-current y muestra su ayuda', () => {
    const html = renderRoute('/panel/list')
    expect(html).toContain('<nav aria-label="Navegación de prueba" class="biblioteca-workspace__nav">')
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/panel\/list"/)
    expect(html).toContain('biblioteca-workspace__destination is-active')
    expect(html).toContain('href="/panel"')
    expect(html).toContain('Ayuda de lista.')
    expect(html).not.toContain('Ayuda de inicio.')
  })

  it('respeta end: la raíz del panel no queda activa en una subruta', () => {
    const html = renderRoute('/panel/list')
    expect(html).not.toMatch(/is-active[^>]*href="\/panel"/)
    expect(renderRoute('/panel')).toContain('Ayuda de inicio.')
  })

  it('sin ruta activa no muestra ayuda y deja pasar los enlaces extra dentro de la navegación', () => {
    const html = renderRoute('/otra-ruta')
    expect(html).not.toContain('biblioteca-workspace__hint')
    expect(html).toContain('href="/extra"')
  })

  it('la variante header envuelve la barra sin línea inferior propia', () => {
    const html = renderRoute('/panel', 'header')
    expect(html).toContain('biblioteca-workspace biblioteca-workspace--standalone biblioteca-workspace--header')
    expect(renderRoute('/panel', 'standalone')).not.toContain('--header')
  })
})
