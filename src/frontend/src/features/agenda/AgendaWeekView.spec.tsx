import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AgendaWeekView from './AgendaWeekView'
import type { AgendaActivity } from '../../services/agenda.service'
import { weekDays } from '../supervisor/calendar-dates'

const days = weekDays('2026-11-09')
const person = { id: 'demo-person', name: 'Persona ficticia' }
const activity = (id: string, startsAt: string): AgendaActivity => ({ id, title: id, startsAt, kind: 'CALL', status: 'PENDING', assigneeId: person.id, creatorId: person.id, assignee: person, creator: person })
const render = (activities: AgendaActivity[], canCreate = true) => renderToStaticMarkup(<AgendaWeekView days={days} activities={activities} today="2026-11-09" teamView canCreate={canCreate} disabled={false} onCreate={() => undefined} onSelect={() => undefined} />)

describe('semana por horas de Colombia', () => {
  it('conserva las 24 horas y ofrece crear con día, año y hora explícitos', () => {
    const html = render([])
    expect(html.split('class="agenda-hour-row"').length - 1).toBe(24)
    expect(html.split('class="agenda-create-slot"').length - 1).toBe(168)
    expect(html).toContain('Crear actividad el 9 de noviembre de 2026 a las 23:00')
    expect(html).toContain('GMT-5')
  })
  it('agrupa al inicio y final del día colombiano sin perder actividades de medianoche UTC', () => {
    const html = render([activity('Madrugada', '2026-11-09T05:15:00Z'), activity('Noche', '2026-11-10T04:30:00Z')])
    expect(html).toContain('title="Madrugada"')
    expect(html).toContain('title="Noche"')
    expect(html).toContain('11:30')
    expect(html.split('title="Noche"').length - 1).toBe(1)
  })
  it('mantiene varios eventos de una hora en orden cronológico y omite otros periodos', () => {
    const html = render([activity('Segundo', '2026-11-09T14:45:00Z'), activity('Fuera', '2026-11-30T14:00:00Z'), activity('Primero', '2026-11-09T14:15:00Z')])
    expect(html.indexOf('title="Primero"')).toBeLessThan(html.indexOf('title="Segundo"'))
    expect(html).not.toContain('title="Fuera"')
  })
  it('permite abrir detalles en solo lectura sin ofrecer creación', () => {
    const html = render([activity('Consulta', '2026-11-09T14:00:00Z')], false)
    expect(html).toContain('title="Consulta"')
    expect(html).not.toContain('agenda-create-slot')
    expect(html).toContain('Persona ficticia')
  })
  it('comunica que una actividad está completada sin depender de opacidad o color', () => {
    const html = render([{ ...activity('Terminada', '2026-11-09T14:00:00Z'), status: 'COMPLETED' }])
    expect(html).toContain('Completada')
  })
})

it('marca la hora de Colombia solo en la semana actual', () => {
 vi.useFakeTimers()
 try {
  vi.setSystemTime(new Date('2026-11-09T17:30:00Z'))
  expect(render([])).toContain('class="agenda-current-time"')
  expect(render([])).toContain('top:50%')
  vi.setSystemTime(new Date('2026-12-01T17:30:00Z'))
  expect(render([])).not.toContain('class="agenda-current-time"')
 } finally { vi.useRealTimers() }
})
