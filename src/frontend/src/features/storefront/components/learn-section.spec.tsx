import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import LearnSection, { upcomingEvents, whenLabel } from './LearnSection'
import type { TrainingEvent } from '../constants/home-catalog'

const NOW = new Date('2026-11-25T15:00:00-05:00')

const events: TrainingEvent[] = [
  { id: 'c', kind: 'clase', title: 'Clase C', startsAt: '2026-12-03T11:00:00-05:00', registrationUrl: 'https://example.com/c' },
  { id: 'old', kind: 'webinar', title: 'Webinar viejo', startsAt: '2026-11-20T09:00:00-05:00', registrationUrl: 'https://example.com/old' },
  { id: 'a', kind: 'webinar', title: 'Webinar A', startsAt: '2026-11-26T09:00:00-05:00', registrationUrl: 'https://example.com/a' },
  { id: 'bad', kind: 'webinar', title: 'Sin https', startsAt: '2026-11-27T09:00:00-05:00', registrationUrl: 'http://example.com/bad' },
  { id: 'b', kind: 'certificacion', title: 'Certificación B', startsAt: '2026-12-02T10:00:00-05:00', registrationUrl: 'https://example.com/b' },
  { id: 'd', kind: 'webinar', title: 'Webinar D', startsAt: '2026-12-10T10:00:00-05:00', registrationUrl: 'https://example.com/d' },
]

function render(list: TrainingEvent[]): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(LearnSection, { events: list, now: NOW })))
}

describe('LearnSection', () => {
  it('sin clases muestra los tres accesos permanentes bajo el título Capacítate', () => {
    const markup = render([])

    expect(markup).toContain('>Capacítate</h2>')
    for (const text of ['Webinars y certificaciones', 'Cursos en línea', 'Certifícate con nosotros']) {
      expect(markup).toContain(text)
    }
    expect(markup).toContain('href="/capacitate"')
    expect(markup).toContain('href="https://elearning.hikvision.com/americas/mobile/"')
    expect(markup).not.toContain('Registrarme')
  })

  it('lista solo las próximas, ordenadas, máximo tres y con enlace https', () => {
    expect(upcomingEvents(events, NOW).map((event) => event.id)).toEqual(['a', 'b', 'c'])
  })

  it('conserva una clase hasta pocas horas después de empezar', () => {
    const running = [{ ...events[2]!, startsAt: '2026-11-25T13:00:00-05:00' }]

    expect(upcomingEvents(running, NOW)).toHaveLength(1)
    expect(upcomingEvents(running, new Date('2026-11-25T19:00:00-05:00'))).toHaveLength(0)
  })

  it('etiqueta Hoy, Mañana o En N días según el día en Colombia', () => {
    expect(whenLabel(new Date('2026-11-25T20:00:00-05:00'), NOW)).toBe('Hoy')
    expect(whenLabel(new Date('2026-11-26T09:00:00-05:00'), NOW)).toBe('Mañana')
    expect(whenLabel(new Date('2026-12-02T10:00:00-05:00'), NOW)).toBe('En 7 días')
    // 11 p. m. en Colombia ya es el día siguiente en UTC, pero sigue siendo hoy aquí
    expect(whenLabel(new Date('2026-11-25T23:30:00-05:00'), new Date('2026-11-25T08:00:00-05:00'))).toBe('Hoy')
  })

  it('destaca la próxima clase y lista las siguientes con su enlace de registro', () => {
    const markup = render(events)

    expect(markup).toContain('Mañana · próxima clase')
    expect(markup).toContain('Webinar A')
    expect(markup).toContain('9:00')
    expect(markup).toContain('href="https://example.com/a"')
    expect(markup).toContain('Certificación B')
    expect(markup).toContain('Clase C')
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).not.toContain('Webinar viejo')
    expect(markup).not.toContain('Sin https')
    expect(markup).not.toContain('Webinar D')
    expect(markup).toContain('Ver calendario completo')
    expect(markup).toContain('Cursos en línea')
  })
})
