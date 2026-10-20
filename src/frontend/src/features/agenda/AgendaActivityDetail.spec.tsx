import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AgendaActivityDetail from './AgendaActivityDetail'
import type { AgendaActivity, AgendaPerson } from '../../services/agenda.service'

/**
 * Regla de la ficha BASE-03: «Separar creador, asignado y actor del cambio»
 * y «historial no se borra al completar». El repo no tiene entorno DOM, así que
 * el cuerpo del diálogo se afirma en render de servidor (mismo patrón que
 * ProductSheetEditor.spec.tsx).
 *
 * Incremento frontend-equipo: «Botones y API concuerdan» — el botón
 * «Reasignar» solo aparece para quien puede equipo y con directorio cargado
 * (si no, no podría llamar a `PATCH /activities/:id/assign`, PANELES:27).
 */

const base: AgendaActivity = {
  id: 'a1',
  title: 'Visita al proyecto Los Robles',
  kind: 'VISIT',
  startsAt: '2026-10-16T14:00:00.000Z',
  status: 'PENDING',
  assigneeId: 'seller-1',
  creatorId: 'sup-1',
  updatedById: null,
  assignee: { id: 'seller-1', name: 'Ana Vendedora' },
  creator: { id: 'sup-1', name: 'Sofía Supervisora' },
  updatedBy: null,
  events: [{ id: 'e1', activityId: 'a1', actorId: 'sup-1', type: 'CREATE', at: '2026-10-14T15:00:00.000Z' }],
}

const render = (activity: AgendaActivity, busy = false) =>
  renderToStaticMarkup(<AgendaActivityDetail activity={activity} busy={busy} onComplete={() => undefined} />)

const completada: AgendaActivity = {
  ...base,
  status: 'COMPLETED',
  updatedById: 'seller-1',
  updatedBy: { id: 'seller-1', name: 'Ana Vendedora' },
  events: [
    ...base.events!,
    { id: 'e2', activityId: 'a1', actorId: 'seller-1', type: 'COMPLETE', at: '2026-10-15T17:30:00.000Z' },
  ],
}

/** Directorio del equipo: nombres que NO son el asignado actual, para poder
 *  distinguir «quién la tiene» de «a quién se puede reasignar». */
const people: AgendaPerson[] = [
  { id: 'seller-3', name: 'Carla Vendedora' },
  { id: 'seller-4', name: 'Diego Vendedor' },
]

type DetailProps = Parameters<typeof AgendaActivityDetail>[0]

const renderDetail = (props: Partial<DetailProps>) =>
  renderToStaticMarkup(
    <AgendaActivityDetail
      activity={props.activity ?? base}
      busy={props.busy ?? false}
      onComplete={props.onComplete ?? (() => undefined)}
      canAssign={props.canAssign}
      people={props.people}
      onReassign={props.onReassign}
      canManageLinks={props.canManageLinks}
      onAddLink={props.onAddLink}
      onRemoveLink={props.onRemoveLink}
      linkError={props.linkError}
    />,
  )

describe('historial visible de una actividad', () => {
  it('separa quién la creó, quién la tiene asignada y quién hizo el último cambio', () => {
    const html = render(completada)

    expect(html).toContain('Creada por:')
    expect(html).toContain('Sofía Supervisora')
    expect(html).toContain('Asignada a:')
    expect(html).toContain('Ana Vendedora')
    expect(html).toContain('Último cambio por:')
    // El actor del último cambio es quien la completó, no quien la creó.
    expect(html.indexOf('Último cambio por:')).toBeGreaterThan(html.indexOf('Asignada a:'))
  })

  it('lista cada evento del historial con su fecha y actor conocido', () => {
    const html = render(completada)

    expect(html).toContain('aria-label="Historial de la actividad"')
    expect(html).toContain('Creada el')
    expect(html).toContain('Completada el')
    expect(html).toContain('Sofía Supervisora')
    expect(html).toContain('Ana Vendedora')
    expect(occurrences(html, '<li')).toBe(2)
  })

  it('una actividad sin cambios aún muestra quién la creó y a quién está asignada', () => {
    const html = render(base)

    expect(html).toContain('Sofía Supervisora')
    expect(html).toContain('Ana Vendedora')
    expect(html).toContain('Sin cambios registrados')
    expect(html).not.toContain('Completada el')
  })

  it('no borra el historial al completar: conserva el evento CREATE y añade COMPLETE', () => {
    expect(completada.events).toHaveLength(2)
    expect(completada.events?.map(e => e.type)).toEqual(['CREATE', 'COMPLETE'])

    const html = render(completada)

    expect(html).toContain('Completada')
    expect(occurrences(html, 'Creada el')).toBe(1)
  })
})

describe('acciones del detalle', () => {
  it('ofrece marcar completada solo a la actividad pendiente', () => {
    expect(render(base)).toContain('Marcar completada')
    expect(render(completada)).not.toContain('Marcar completada')
  })

  it('muestra el estado del guardado mientras se atiende la petición', () => {
    expect(render(base, true)).toContain('Guardando')
    expect(render(base, true)).not.toContain('Marcar completada')
  })

  it('presenta el tipo con el vocabulario de la agenda y la hora de Colombia', () => {
    const html = render(base)

    expect(html).toContain('Visita a proyecto')
    expect(html).toContain('Pendiente')
    expect(html).toContain('Colombia')
  })
})

describe('botón Reasignar (solo vista de equipo)', () => {
  it('en vista propia el botón de reasignar no aparece', () => {
    const html = renderDetail({ canAssign: false, people })

    expect(html).not.toContain('Reasignar')
    expect(html).not.toContain('Carla Vendedora')
    expect(html).not.toContain('<select')
  })

  it('quien puede equipo ve el botón junto al directorio de vendedores', () => {
    const html = renderDetail({ canAssign: true, people })

    expect(html).toContain('aria-label="Reasignar actividad"')
    expect(html).toContain('Reasignar')
    expect(html).toContain('Carla Vendedora')
    expect(html).toContain('Diego Vendedor')
  })

  it('con permiso pero sin directorio no se ofrece el botón: no podría llamar a la API', () => {
    expect(renderDetail({ canAssign: true, people: [] })).not.toContain('Reasignar')
    expect(renderDetail({ canAssign: true })).not.toContain('Reasignar')
  })

  it('el botón de completar sigue siendo el único disponible sin permiso de equipo', () => {
    const html = renderDetail({ canAssign: false, people })

    expect(html).toContain('Marcar completada')
  })
})

describe('eventos del historial de reasignación', () => {
  const reasignada: AgendaActivity = {
    ...base,
    updatedById: 'sup-2',
    updatedBy: { id: 'sup-2', name: 'Marcela Supervisora' },
    assignee: { id: 'seller-3', name: 'Carla Vendedora' },
    assigneeId: 'seller-3',
    events: [
      ...base.events!,
      { id: 'e2', activityId: 'a1', actorId: 'sup-2', type: 'ASSIGN', at: '2026-10-15T16:00:00.000Z' },
    ],
  }

  it('muestra el evento ASSIGN que escribe la API al reasignar', () => {
    const html = renderDetail({ activity: reasignada })

    expect(html).toContain('Reasignada el')
    expect(occurrences(html, '<li')).toBe(2)
  })

  it('el actor de la reasignación es quien la hizo, no la creadora ni la persona asignada', () => {
    const html = renderDetail({ activity: reasignada })

    // La creadora sigue siendo Sofía; la reasignación la hizo Marcela.
    expect(html).toContain('Creada el')
    expect(html).toContain('· Marcela Supervisora')
    expect(occurrences(html, '· Marcela Supervisora')).toBe(1)
  })
})

describe('vínculos de la actividad (BASE-03 frontend-vinculos)', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'
  const oculto: AgendaActivity['links'] = [
    { id: 'l1', targetType: 'PRODUCT', targetId: UUID, revealed: false },
  ]
  const revelado: AgendaActivity['links'] = [
    {
      id: 'l2',
      targetType: 'PRODUCT',
      targetId: UUID,
      revealed: true,
      label: 'Producto Fixture Vinculos',
      target: { id: UUID, name: 'Producto Fixture Vinculos', sku: 'T06C-SKU-1', publishStatus: 'borrador' },
    },
  ]

  it('sin vínculos el detalle sigue completo (sección de estado vacío)', () => {
    const html = renderDetail({ activity: base })

    expect(html).toContain('Recursos enlazados')
    expect(html).toContain('Sin recursos enlazados')
    expect(html).toContain('Marcar completada')
  })

  it('revealed:false se pinta solo tipo+id, sin label, sin detalle y sin navegación', () => {
    const html = renderDetail({ activity: { ...base, links: oculto } })

    expect(html).toContain('PRODUCT')
    expect(html).toContain(UUID)
    expect(html).not.toContain('Producto Fixture')
    expect(html).not.toContain('T06C-SKU-1')
    expect(html).not.toContain('borrador')
    expect(html).not.toContain('href=')
    expect(html).toContain('aria-disabled="true"')
  })

  it('revealed:true sí muestra label, nombre, sku y estado del recurso', () => {
    const html = renderDetail({ activity: { ...base, links: revelado } })

    expect(html).toContain('Producto Fixture Vinculos')
    expect(html).toContain('T06C-SKU-1')
    expect(html).toContain('borrador')
    expect(html).not.toContain('aria-disabled="true"')
  })

  it('sin canManageLinks no se ofrece añadir ni quitar: el detalle solo pinta', () => {
    const html = renderDetail({ activity: { ...base, links: oculto }, canManageLinks: false })

    expect(html).not.toContain('Añadir enlace')
    expect(html).not.toContain('Quitar')
    expect(html).not.toContain('<form')
    expect(html).toContain('PRODUCT')
  })

  it('con canManageLinks aparece el formulario de alta (selector de tipos + campo UUID)', () => {
    const html = renderDetail({ activity: { ...base, links: oculto }, canManageLinks: true })

    expect(html).toContain('Añadir enlace')
    expect(html).toContain('<form')
    expect(html).toContain('Quitar')
  })

  it('el error de alta/baja se muestra en la sección sin borrar ni la lista ni el resto del detalle', () => {
    const html = renderDetail({
      activity: { ...base, links: revelado },
      canManageLinks: true,
      linkError: 'Ese recurso ya está enlazado a esta actividad',
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('Ese recurso ya está enlazado a esta actividad')
    expect(html).toContain('Producto Fixture Vinculos')
    expect(html).toContain('Creada por:')
    expect(html).toContain('Marcar completada')
  })
})

function occurrences(text: string, needle: string) {
  return text.split(needle).length - 1
}
