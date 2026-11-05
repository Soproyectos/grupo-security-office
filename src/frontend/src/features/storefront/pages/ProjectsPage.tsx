import PageIntro from '../components/PageIntro'
import StorefrontChrome from '../components/StorefrontChrome'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const STEPS = [
  {
    title: 'Evaluación y consultoría',
    text: 'Analizamos las necesidades y los riesgos específicos de cada cliente para diseñar una solución de seguridad personalizada.',
  },
  {
    title: 'Diseño e implementación',
    text: 'Desarrollamos proyectos que integran las tecnologías más avanzadas del mercado, asegurando una instalación eficiente y efectiva.',
  },
  {
    title: 'Mantenimiento y soporte',
    text: 'Proveemos un servicio continuo de mantenimiento y soporte técnico, garantizando el funcionamiento óptimo de todos los sistemas instalados.',
  },
  {
    title: 'Atención al cliente',
    text: 'Además de la venta y distribución de productos de seguridad, brindamos una atención personalizada en nuestras tiendas físicas, donde los clientes pueden recibir asesoramiento experto y soluciones adaptadas a sus necesidades. Nuestro compromiso con la satisfacción del cliente es primordial, y trabajamos constantemente para ofrecer el mejor servicio en cada interacción.',
  },
]

export default function ProjectsPage() {
  useDocumentTitle('Asesoría para proyectos | Grupo Security')

  return (
    <StorefrontChrome>
      <main className="text-storefront-ink">
        <PageIntro
          breadcrumbs={[
            { label: 'Inicio', to: '/tienda' },
            { label: 'Servicios', to: '/servicios' },
            { label: 'Asesoría para proyectos' },
          ]}
          title="Asesoría para proyectos"
          description="Cuéntanos qué espacio quieres proteger y qué necesitas controlar. Te acompañamos de la idea a la operación."
        />
        <div className="mx-auto max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
          <section aria-labelledby="projects-about-title" className="max-w-[65ch]">
            <h2 id="projects-about-title" className="text-xl font-bold text-storefront-ink">
              Desarrollo de proyectos
            </h2>
            <p className="mt-2 text-ink-600">
              Grupo Security SAS es una empresa líder en tecnología y seguridad electrónica con una presencia
              significativa en varias regiones del país. Con cuatro sedes estratégicamente ubicadas en Pereira,
              Armenia, Manizales y Cali, la empresa garantiza una cobertura amplia y eficiente para atender las
              necesidades de sus clientes en diferentes áreas.
            </p>
            <h3 className="mt-5 text-lg font-bold text-storefront-ink">Convenios de distribución</h3>
            <p className="mt-2 text-ink-600">
              Contamos con convenios de distribución con las marcas líderes en el mercado de productos de seguridad,
              como Hikvision y Ezviz. Estos acuerdos nos permiten ofrecer a nuestros clientes lo último en tecnología
              de seguridad, garantizando productos de alta calidad y con las certificaciones necesarias.
            </p>
            <h3 className="mt-5 text-lg font-bold text-storefront-ink">Personal idóneo y proyectos a medida</h3>
            <p className="mt-2 text-ink-600">
              En Grupo Security SAS, nos enorgullecemos de contar con un equipo de profesionales altamente capacitados
              y especializados en el desarrollo de proyectos de seguridad. Ofrecemos soluciones a medida que se
              adaptan a las necesidades específicas de cada cliente, abarcando desde pequeñas empresas hasta grandes
              corporaciones. Nuestro enfoque integral nos permite:
            </p>
          </section>
          <ol className="mt-6 max-w-3xl divide-y divide-surface-200 border-y border-surface-200">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5 py-5">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-security-600 text-lg font-bold text-white"
                >
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-xl font-bold text-storefront-ink">
                    <span className="sr-only">{`Paso ${index + 1}: `}</span>
                    {step.title}
                  </h2>
                  <p className="mt-1 text-ink-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <section aria-labelledby="projects-future-title" className="mt-8 max-w-[65ch]">
            <h2 id="projects-future-title" className="text-xl font-bold text-storefront-ink">
              Innovación y futuro
            </h2>
            <p className="mt-2 text-ink-600">
              Grupo Security SAS se mantiene a la vanguardia de la innovación en seguridad electrónica, explorando
              continuamente nuevas tecnologías y métodos para mejorar nuestros servicios. Estamos comprometidos con la
              excelencia y la seguridad de nuestros clientes, y nuestro objetivo es seguir liderando el mercado con
              soluciones seguras, confiables y efectivas.
            </p>
          </section>
          <section
            aria-labelledby="projects-quote-title"
            className="mt-8 flex flex-col gap-4 rounded-card bg-surface-100 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 id="projects-quote-title" className="text-xl font-bold text-storefront-ink">
                Cotiza tu proyecto
              </h2>
              <p className="mt-1 text-ink-600">Escríbenos por WhatsApp y cuéntanos qué necesitas.</p>
            </div>
            <a
              href={whatsappUrl(WHATSAPP_MESSAGES.projects)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center rounded-control bg-security-600 px-6 font-bold !text-white hover:underline hover:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Cotizar por WhatsApp
            </a>
          </section>
        </div>
      </main>
    </StorefrontChrome>
  )
}
