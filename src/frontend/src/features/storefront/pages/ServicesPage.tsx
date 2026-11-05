import { Link } from 'react-router-dom'
import PageIntro from '../components/PageIntro'
import ServiceCard from '../components/ServiceCard'
import StorefrontChrome from '../components/StorefrontChrome'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const ICONS = {
  projects: 'm2 12 4-6 4 2 4-1 4-1 4 6-4 4-5 4-7-5z M10 8l-3 4 2 2 4-3 5 5',
  support: 'M3 13v-2a9 9 0 0 1 18 0v2 M3 13h4v6H5a2 2 0 0 1-2-2z M21 13h-4v6h2a2 2 0 0 0 2-2z M19 19c0 2-3 3-7 3',
  certifications: 'M19 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M9 9l2 2 4-4 M7 14l-2 8 4-2 3 2 3-2 4 2-2-8',
}

export default function ServicesPage() {
  useDocumentTitle('Servicios | Grupo Security')

  return (
    <StorefrontChrome>
      <main className="text-storefront-ink">
        <PageIntro
          breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Servicios' }]}
          title="Servicios"
          description="Ayuda para tu proyecto, tus equipos y tu formación. Elige lo que necesitas."
        />
        <div className="mx-auto max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
          <div className="grid gap-5 sm:grid-cols-3">
            <ServiceCard
              title="Asesoría para proyectos"
              description="Evaluamos el riesgo de tu espacio, diseñamos la solución y te acompañamos en la instalación."
              actionLabel="Conocer el proceso"
              to="/servicios/proyectos"
              iconPath={ICONS.projects}
            />
            <ServiceCard
              title="Soporte técnico"
              description="Configurar un equipo que compraste, diagnóstico o reparación, y garantías. Cada caso tiene su propio camino."
              actionLabel="Elegir tipo de ayuda"
              to="/servicios/soporte"
              iconPath={ICONS.support}
              highlight
            />
            <ServiceCard
              title="Certificaciones"
              description="Formación HCSA Hikvision para técnicos, instaladores, integradores y asesores comerciales."
              actionLabel="Ver temas y fechas"
              to="/servicios/certificaciones"
              iconPath={ICONS.certifications}
            />
          </div>
          <section
            aria-labelledby="services-setup-title"
            className="mt-8 flex flex-col gap-4 rounded-card bg-surface-100 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 id="services-setup-title" className="text-xl font-bold text-storefront-ink">
                ¿Acabas de comprar una cámara?
              </h2>
              <p className="mt-1 text-ink-600">Te ayudamos a dejarla funcionando.</p>
            </div>
            <Link
              to="/servicios/soporte/configurar"
              className="inline-flex min-h-12 items-center justify-center rounded-control bg-security-600 px-6 font-bold !text-white hover:underline hover:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Configurar mi equipo
            </Link>
          </section>
          <p className="mt-6 text-ink-600">
            ¿Quieres ver todo lo que hacemos?{' '}
            <a
              href="/documentos/portafolio-servicios-2026.pdf"
              download
              className="inline-flex min-h-11 items-center font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Descargar el portafolio de servicios 2026 (PDF, 15 MB)
            </a>
          </p>
        </div>
      </main>
    </StorefrontChrome>
  )
}
