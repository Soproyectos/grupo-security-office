import PageIntro from '../components/PageIntro'
import StorefrontChrome from '../components/StorefrontChrome'
import { HIKVISION_ELEARNING_URL } from '../components/LearnSection'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const CALENDAR_URL = 'https://hikvisionlatam.tech/calendar/latam'

/** Hikvision's own calendar, embedded as they publish it. Dates and registration links come from Hikvision. */
export default function TrainingCalendarPage() {
  useDocumentTitle('Capacítate con Hikvision | Grupo Security')

  return (
    <StorefrontChrome>
      <main className="text-storefront-ink">
        <PageIntro
          breadcrumbs={[
            { label: 'Inicio', to: '/tienda' },
            { label: 'Capacítate' },
          ]}
          title="Capacítate con Hikvision"
          description="Webinars, seminarios y certificaciones. Elige Colombia en el calendario para ver las fechas que te corresponden."
        />
        <div className="mx-auto max-w-[105rem] px-5 py-6 sm:px-8 lg:px-12">
          <iframe
            title="Calendario de webinars y certificaciones de Hikvision"
            src={CALENDAR_URL}
            loading="lazy"
            className="block h-[820px] w-full rounded-card border border-surface-200 bg-white"
          />
          <p className="mt-4 max-w-[65ch] text-ink-600">
            El calendario lo publica Hikvision. Para registrarte en una clase, sigue el enlace que aparece en cada evento.{' '}
            ¿Prefieres aprender a tu ritmo? Entra al{' '}
            <a
              href={HIKVISION_ELEARNING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-bold !text-security-600 hover:underline hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              e-learning de Hikvision<span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            .
          </p>
        </div>
      </main>
    </StorefrontChrome>
  )
}
