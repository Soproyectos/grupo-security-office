import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgendaEmptyState, AgendaTruncatedNotice } from './AgendaNotices'

describe('aviso de tope de tareas', () => {
  it('avisa con el número de tareas y que las más recientes no aparecen', () => {
    const html = renderToStaticMarkup(<AgendaTruncatedNotice limit={1000} />)

    expect(html).toContain('role="status"')
    expect(html).toMatch(/primeras 1\D?000 tareas; las más recientes no aparecen/)
  })

  it('usa 1000 si el servidor no informó el tope', () => {
    expect(renderToStaticMarkup(<AgendaTruncatedNotice />)).toMatch(/primeras 1\D?000 tareas/)
  })
})

describe('estado vacío', () => {
  const render = (props: Partial<Parameters<typeof AgendaEmptyState>[0]>) =>
    renderToStaticMarkup(<AgendaEmptyState teamView={false} noTeam={false} hasRowsInScope={false} canCreate {...props} />)

  it('primer uso de la agenda propia guía a crear', () => {
    expect(render({})).toContain('Pulsa «Crear actividad»')
  })

  it('sin permiso para crear no manda a un botón que no existe', () => {
    const html = render({ canCreate: false })

    expect(html).not.toContain('Crear actividad')
    expect(html).toContain('Todavía no tienes tareas en tu agenda')
  })

  it('persona sin equipo en la vista de equipo', () => {
    expect(render({ teamView: true, noTeam: true })).toContain('Todavía no tienes personas a tu cargo')
  })

  it('equipo sin tareas', () => {
    expect(render({ teamView: true })).toContain('Tu equipo todavía no tiene tareas')
  })

  it('filtros que ocultan todo', () => {
    expect(render({ hasRowsInScope: true })).toContain('Ninguna tarea coincide con los filtros')
  })
})
