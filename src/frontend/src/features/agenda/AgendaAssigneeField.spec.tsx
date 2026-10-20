import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AgendaAssigneeField from './AgendaAssigneeField'
import type { AgendaPerson } from '../../services/agenda.service'

/**
 * ACEPTACIÓN BASE-03 frontend-equipo: «Usuario sin equipo: ni toggle, ni campo
 * de asignado ajenos». El toggle y el fieldset ya los cubre la página; el
 * selector de vendedor del formulario de creación se afirma aquí con el mismo
 * criterio (`canAssign`) porque el diálogo no se puede abrir en render de
 * servidor (ver AgendaCalendarPage.spec.tsx).
 */

const people: AgendaPerson[] = [
  { id: 'seller-1', name: 'Ana Vendedora' },
  { id: 'seller-2', name: 'Luis Vendedor' },
]

const render = (canAssign: boolean, value = '', options: AgendaPerson[] = people) =>
  renderToStaticMarkup(
    <AgendaAssigneeField canAssign={canAssign} people={options} value={value} onChange={() => undefined} />,
  )

describe('selector de asignado al crear', () => {
  it('quien no puede equipo no renderiza campo de asignado alguno', () => {
    const html = render(false)

    expect(html).not.toContain('<select')
    expect(html).not.toContain('Vendedor')
    expect(html).not.toContain('Selecciona un vendedor')
  })

  it('quien puede equipo ve el directorio completo de vendedores', () => {
    const html = render(true)

    expect(html).toContain('Vendedor')
    expect(html).toContain('Selecciona un vendedor')
    expect(html).toContain('Ana Vendedora')
    expect(html).toContain('Luis Vendedor')
    expect(html).toContain('required')
  })

  it('conserva el vendedor elegido para no perder la selección al reenviar', () => {
    expect(render(true, 'seller-2')).toContain('value="seller-2"')
  })

  it('con permiso pero sin directorio cargado no ofrece una lista vacía', () => {
    const html = render(true, '', [])

    expect(html).toContain('Selecciona un vendedor')
    expect(html).not.toContain('Ana Vendedora')
  })
})
