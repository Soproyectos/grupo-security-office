import { Link } from 'react-router-dom'
import { HOME_TRAINING_EVENTS, type TrainingEvent } from '../constants/home-catalog'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'
const MAX_EVENTS = 3
/** An event stays listed until this long after it starts. */
const GRACE_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const HIKVISION_ELEARNING_URL = 'https://elearning.hikvision.com/americas/mobile/'

const KIND_LABEL: Record<TrainingEvent['kind'], string> = {
  webinar: 'Webinar',
  clase: 'Clase abierta',
  certificacion: 'Certificación',
}

const ICONS = {
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  course: 'M3 6l9-3 9 3-9 3-9-3zM7 8.5V13c0 1.5 2.2 3 5 3s5-1.5 5-3V8.5',
  badge: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
} as const

interface Access {
  title: string
  text: string
  to: string
  external: boolean
  icon: string
}

const CALENDAR_ACCESS: Access = { title: 'Webinars y certificaciones', text: 'Mira las fechas de las próximas clases de Hikvision y regístrate.', to: '/capacitate', external: false, icon: ICONS.calendar }
const COURSES_ACCESS: Access = { title: 'Cursos en línea', text: 'Aprende a tu ritmo, en español.', to: HIKVISION_ELEARNING_URL, external: true, icon: ICONS.course }
const CERT_ACCESS: Access = { title: 'Certifícate con nosotros', text: 'Formación HCSA para técnicos, instaladores e integradores.', to: '/servicios/certificaciones', external: false, icon: ICONS.badge }

function part(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', ...options }).format(date)
}

/** Calendar day in Colombia as a comparable number of days. */
function colombiaDay(date: Date): number {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date).split('-').map(Number)
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / DAY_MS
}

/** "Hoy", "Mañana" or "En N días", counted in Colombian calendar days. */
export function whenLabel(start: Date, now: Date): string {
  const days = colombiaDay(start) - colombiaDay(now)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Mañana'
  return `En ${days} días`
}

/** Upcoming events (still running or about to start), soonest first, with a valid https registration link. */
export function upcomingEvents(events: readonly TrainingEvent[], now: Date): TrainingEvent[] {
  return events
    .filter((event) => event.registrationUrl.startsWith('https://') && new Date(event.startsAt).getTime() + GRACE_MS >= now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, MAX_EVENTS)
}

function AccessCard({ access }: { access: Access }) {
  const { title, text, to, external, icon } = access
  const body = (
    <>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 shrink-0 text-security-600">
        <path d={icon} />
      </svg>
      <span className="flex flex-col">
        <span className="text-lg font-bold text-storefront-ink group-hover:text-security-600">
          {title}
          {external && <span className="sr-only"> (se abre en otra pestaña)</span>}
        </span>
        <span className="text-sm text-ink-600">{text}</span>
      </span>
    </>
  )
  const className = `group flex h-full min-h-16 items-center gap-3 rounded-card border border-surface-200 bg-surface-100 px-4 py-3 hover:border-security-600 ${FOCUS}`
  return external
    ? <a href={to} target="_blank" rel="noopener noreferrer" className={className}>{body}</a>
    : <Link to={to} className={className}>{body}</Link>
}

function DateBox({ start, large = false }: { start: Date; large?: boolean }) {
  return (
    <span aria-hidden="true" className={`block shrink-0 overflow-hidden rounded-card border border-surface-200 bg-white text-center text-storefront-ink ${large ? 'w-24' : 'w-14'}`}>
      <span className={`block bg-security-600 font-bold uppercase tracking-wider text-white ${large ? 'py-1 text-[13px]' : 'py-0.5 text-[10px]'}`}>{part(start, { month: 'short' }).replace('.', '')}</span>
      <span className={`block font-bold leading-tight ${large ? 'pt-1.5 text-[44px]' : 'pt-0.5 text-2xl'}`}>{part(start, { day: 'numeric' })}</span>
      <span className={`block capitalize text-ink-600 ${large ? 'pb-2 text-[13px]' : 'pb-1 text-[11px]'}`}>{part(start, { weekday: 'short' }).replace('.', '')}</span>
    </span>
  )
}

function whenText(start: Date): string {
  const weekday = part(start, { weekday: 'long' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${part(start, { day: 'numeric', month: 'long' })} · ${part(start, { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

/** Next Hikvision class highlighted, the following ones listed, and the permanent training links. */
export default function LearnSection({ events = HOME_TRAINING_EVENTS, now }: { events?: readonly TrainingEvent[]; now?: Date }) {
  const current = now ?? new Date()
  const [first, ...rest] = upcomingEvents(events, current)

  return (
    <section aria-labelledby="home-learn-title" className="mx-auto max-w-[80rem] px-5 py-3 sm:px-8 lg:px-10">
      <h2 id="home-learn-title" className="mb-2 text-2xl font-bold">Capacítate</h2>
      {!first ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {[CALENDAR_ACCESS, COURSES_ACCESS, CERT_ACCESS].map((access) => <li key={access.title}><AccessCard access={access} /></li>)}
        </ul>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="relative flex gap-5 overflow-hidden rounded-card bg-neutral-800 px-5 py-5 text-white sm:px-6">
              <span aria-hidden="true" className="absolute -right-14 -top-14 size-56 rounded-full bg-security-600/30" />
              <div className="relative flex min-w-0 flex-1 flex-col gap-2">
                <span className="inline-flex self-start rounded-full bg-security-600 px-2.5 py-0.5 text-xs font-bold">{whenLabel(new Date(first.startsAt), current)} · próxima clase</span>
                <span className="text-2xl font-bold leading-tight sm:text-[28px]">{first.title}</span>
                <span className="text-base text-white/95">{whenText(new Date(first.startsAt))}</span>
                <span className="text-sm text-white/80">{KIND_LABEL[first.kind]} de Hikvision</span>
                <a
                  href={first.registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-1.5 inline-flex min-h-11 items-center justify-center self-start rounded-control bg-white px-5 font-bold !text-security-600 hover:underline hover:!text-security-600 ${FOCUS}`}
                >
                  Registrarme<span className="sr-only"> en {first.title} (se abre en otra pestaña)</span>
                </a>
              </div>
              <div className="relative hidden self-center sm:block"><DateBox start={new Date(first.startsAt)} large /></div>
            </div>
            {rest.length > 0 && (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {rest.map((event) => {
                  const start = new Date(event.startsAt)
                  return (
                    <li key={event.id}>
                      <a
                        href={event.registrationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group flex h-full items-center gap-3 rounded-card border border-surface-200 bg-white p-3 hover:border-security-600 ${FOCUS}`}
                      >
                        <DateBox start={start} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="inline-flex self-start rounded-full bg-surface-100 px-2 py-0.5 text-xs font-bold text-neutral-800">{KIND_LABEL[event.kind]}</span>
                          <span className="text-base font-bold leading-tight text-storefront-ink group-hover:text-security-600">{event.title}</span>
                          <span className="text-[13px] text-ink-600">{whenText(start)}</span>
                          <span className="sr-only">Registrarme (se abre en otra pestaña)</span>
                        </span>
                        <span aria-hidden="true" className="text-2xl leading-none text-security-600">›</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <AccessCard access={COURSES_ACCESS} />
            <AccessCard access={CERT_ACCESS} />
            <Link to="/capacitate" className={`inline-flex min-h-11 items-center font-bold text-security-600 hover:underline ${FOCUS}`}>
              Ver calendario completo <span aria-hidden="true" className="ml-2 text-xl">›</span>
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
