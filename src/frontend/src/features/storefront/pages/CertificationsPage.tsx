import { Link } from 'react-router-dom'
import PageIntro from '../components/PageIntro'
import StorefrontChrome from '../components/StorefrontChrome'
import { whatsappUrl } from '../constants/contact'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const CERTIFICATIONS_MESSAGE = 'Hola, quiero conocer el calendario, los cupos y los requisitos de las certificaciones HCSA Hikvision.'

const TOPICS = ['CCTV', 'Sistema de alarmas', 'Intercomunicaciones', 'Control de acceso', 'Manejo de software de gestión Hik-Central']

export default function CertificationsPage() {
  useDocumentTitle('Certificaciones HCSA Hikvision | Grupo Security')

  return (
    <StorefrontChrome>
      <main className="text-storefront-ink">
        <PageIntro
          breadcrumbs={[
            { label: 'Inicio', to: '/tienda' },
            { label: 'Servicios', to: '/servicios' },
            { label: 'Certificaciones' },
          ]}
          title="Certificaciones HCSA Hikvision"
          description="Formación para técnicos, instaladores, integradores y asesores comerciales."
        />
        <div className="mx-auto max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
          <section aria-labelledby="cert-intro-title" className="mb-8 max-w-[65ch]">
            <h2 id="cert-intro-title" className="text-2xl font-bold text-storefront-ink">
              Certificaciones HCSA Hikvision
            </h2>
            <p className="mt-3 text-ink-600">
              Desde Grupo Security SAS queremos impulsar el crecimiento profesional para asesores comerciales,
              técnicos, instaladores o integradores de seguridad electrónica. A través de nuestro programa integral de
              certificaciones, nos enfocamos en brindar conocimientos teóricos y prácticos sobre productos de
              seguridad, garantizando así niveles óptimos de desempeño en la implementación y operación.
            </p>
          </section>
          <section aria-labelledby="cert-topics-title">
            <h2 id="cert-topics-title" className="text-2xl font-bold text-storefront-ink">
              El portafolio de certificaciones abarca los siguientes temas
            </h2>
            <ul className="mt-4 grid max-w-3xl gap-2 sm:grid-cols-2">
              {TOPICS.map((topic) => (
                <li key={topic} className="flex min-h-11 items-center rounded-control bg-surface-100 px-4 font-medium text-storefront-ink">
                  {topic}
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-[65ch] text-ink-600">
              Los diferentes tópicos brindan la posibilidad de adquirir habilidades especializadas en diferentes áreas
              de la seguridad electrónica, favoreciendo escenarios laborales en donde se potencia la posibilidad de
              abordar proyectos más complejos y diversos.
            </p>
          </section>
          <section aria-labelledby="cert-dates-title" className="mt-8">
            <h2 id="cert-dates-title" className="text-2xl font-bold text-storefront-ink">
              Fechas, cupos e inscripción
            </h2>
            <p className="mt-3 max-w-[65ch] text-ink-600">
              Si deseas conocer nuestro calendario de certificaciones, comunícate con nosotros.
            </p>
            <a
              href={whatsappUrl(CERTIFICATIONS_MESSAGE)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-12 items-center justify-center rounded-control bg-security-600 px-6 font-bold !text-white hover:underline hover:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Pedir fechas por WhatsApp
            </a>
          </section>
          <p className="mt-8 max-w-[65ch] text-ink-600">
            ¿Buscas ayuda con un equipo que ya compraste? Está en{' '}
            <Link
              to="/servicios/soporte"
              className="inline-flex min-h-11 items-center font-bold !text-security-600 hover:underline hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Soporte técnico
            </Link>
            .
          </p>
        </div>
      </main>
    </StorefrontChrome>
  )
}
