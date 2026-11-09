import { useEffect, useRef, useState } from 'react'
import type { AgendaActivity } from '../../services/agenda.service'
import { colombiaDay } from '../supervisor/calendar-dates'

const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', hourCycle: 'h23' })
const timeFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'short' })
const eventColors: Record<string, string> = { CALL: 'agenda-event-call', VISIT: 'agenda-event-visit', FOLLOW_UP: 'agenda-event-follow-up' }

export default function AgendaWeekView({ days, activities, today, teamView, canCreate, disabled, onCreate, onSelect }: {
  days: string[]
  activities: AgendaActivity[]
  today: string
  teamView: boolean
  canCreate: boolean
  disabled: boolean
  onCreate: (day: string, time: string) => void
  onSelect: (activity: AgendaActivity) => void
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000)
    const refresh = () => setNow(new Date())
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  const currentDay = colombiaDay(now.getTime())
  const currentHour = Number(hourFormat.format(now))
  const currentMinute = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', minute: '2-digit' }).format(now))
  const firstDay = days[0]
  useEffect(() => {
    // Center once when entering a week; clock ticks must not override manual scrolling.
    const frame = window.requestAnimationFrame(() => {
      const viewport = scroll.current
      if (!viewport) return
      const marker = viewport.querySelector('.agenda-current-time')
      if (!marker) { viewport.scrollTop = 8 * 48; return }
      const headerHeight = viewport.querySelector('.agenda-week-head')?.getBoundingClientRect().height ?? 0
      const center = headerHeight + (viewport.clientHeight - headerHeight) / 2
      viewport.scrollTop += marker.getBoundingClientRect().top - viewport.getBoundingClientRect().top - center
    })
    return () => window.cancelAnimationFrame(frame)
  }, [firstDay])
  const period = new Set(days)
  const byHour = new Map<string, AgendaActivity[]>()
  for (const activity of [...activities].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const day = colombiaDay(activity.startsAt)
    if (!period.has(day)) continue
    const key = `${day}-${hourFormat.format(new Date(activity.startsAt))}`
    const group = byHour.get(key) ?? []
    group.push(activity)
    byHour.set(key, group)
  }
  return <div ref={scroll} className="agenda-week-view" role="region" aria-label="Semana por horas · Colombia" tabIndex={0}>
    <div className="agenda-week-head"><span>GMT-5</span>{days.map(day => {
      const date = new Date(`${day}T12:00:00Z`)
      return <div key={day} className={day === today ? 'is-today' : ''}><span>{weekdayFormat.format(date)}</span><b>{Number(day.slice(-2))}</b></div>
    })}</div>
    <div className="agenda-week-body">{Array.from({ length: 24 }, (_, hour) => {
      const time = `${String(hour).padStart(2, '0')}:00`
      return <div className="agenda-hour-row" key={hour}><span className="agenda-hour-label">{time}</span>{days.map(day => <div className="agenda-hour-cell" key={day}>
        {day === currentDay && hour === currentHour && <span className="agenda-current-time" role="img" aria-label={`Hora actual en Colombia: ${timeFormat.format(now)}`} style={{ top: `${currentMinute / 60 * 100}%` }}><span style={{top:currentMinute<30?3:'auto',bottom:currentMinute<30?'auto':3}}>{timeFormat.format(now)}</span></span>}
        {canCreate && <button type="button" className="agenda-create-slot" aria-label={`Crear actividad el ${dateFormat.format(new Date(`${day}T12:00:00Z`))} a las ${time}`} disabled={disabled} onClick={() => onCreate(day, time)} />}
        {(byHour.get(`${day}-${String(hour).padStart(2, '0')}`) ?? []).map(activity => <button type="button" key={activity.id} title={activity.title} className={`agenda-week-event ${eventColors[activity.kind] ?? eventColors.CALL}`} onClick={() => onSelect(activity)}>
          <b>{timeFormat.format(new Date(activity.startsAt))}{activity.status === 'COMPLETED' ? ' · Completada' : ''}</b>{activity.title}{teamView && <small>{activity.assignee.name}</small>}
        </button>)}
      </div>)}</div>
    })}</div>
  </div>
}

