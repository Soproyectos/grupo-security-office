import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PageIntro from '../components/PageIntro'
import { BRANCHES, branchDirectionsUrl, branchPhoneHref, formatBranchPhone } from '../constants/branches'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'

const LINK_CLASS =
  'inline-flex min-h-11 items-center gap-1 font-bold !text-security-600 hover:underline hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'

export default function BranchesPage() {
  return (
    <StorefrontChrome>
      <PageIntro
        breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Sedes' }]}
        title="Nuestras sedes"
        description="Visítanos en Pereira, Armenia, Manizales o Cali. Estas son las direcciones oficiales de cada sede."
      />
      <main className="mx-auto w-full max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BRANCHES.map((branch) => (
            <li key={branch.city} className="flex flex-col rounded-card border border-surface-200 bg-white p-6">
              <h2 className="text-xl font-bold text-storefront-ink">{branch.city}</h2>
              <address className="mt-2 not-italic text-ink-600">{branch.address}</address>
              {branch.phone && (
                <a href={branchPhoneHref(branch.phone)} className={`mt-2 self-start ${LINK_CLASS}`}>
                  <span className="sr-only">Llamar a la sede de {branch.city}: </span>
                  {formatBranchPhone(branch.phone)}
                </a>
              )}
              {branch.schedule && (
                <dl className="mb-4 mt-3 space-y-1 text-sm text-ink-600">
                  {branch.schedule.map(({ days, hours }) => (
                    <div key={days} className="flex flex-wrap gap-x-2">
                      <dt className="font-bold text-storefront-ink">{days}:</dt>
                      <dd>{hours}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <a
                href={branchDirectionsUrl(branch)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Cómo llegar a la sede de ${branch.city}`}
                className={`mt-auto self-start ${LINK_CLASS}`}
              >
                Cómo llegar
                <span aria-hidden="true">›</span>
              </a>
            </li>
          ))}
        </ul>
        <section className="mt-8 rounded-card bg-surface-100 p-6">
          <h2 className="text-xl font-bold text-storefront-ink">¿Necesitas confirmar horario o disponibilidad?</h2>
          <p className="mt-2 max-w-[65ch] text-ink-600">
            Escríbenos antes de ir y te confirmamos si la sede tiene lo que buscas. Si vas por una garantía, revisa
            primero qué debes llevar en{' '}
            <Link
              to="/garantias"
              className="font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Garantías
            </Link>
            .
          </p>
          <a
            href={whatsappUrl(WHATSAPP_MESSAGES.contact)}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 ${LINK_CLASS}`}
          >
            Escribir por WhatsApp
            <span aria-hidden="true">›</span>
          </a>
        </section>
      </main>
    </StorefrontChrome>
  )
}
