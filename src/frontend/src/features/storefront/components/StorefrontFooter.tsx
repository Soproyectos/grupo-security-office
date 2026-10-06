import { whatsappUrl } from '../constants/contact'
import { useStorefrontContact } from '../hooks/useStorefrontContact'

/**
 * Full footer of the storefront: dark background with the red accent,
 * responsive link columns, contact info and a bottom row with the copyright and
 * social icons.
 *
 * The link lists are data: an entry without `href` has no destination yet (its
 * page does not exist) and is not rendered, and a column or the social row with
 * nothing to show disappears. Giving an entry its `href` is all it takes to
 * publish it. Contact data comes from `useStorefrontContact()` (public API,
 * falling back to the demo values of `constants/contact.ts`); the columns and
 * the social row stay out of that record and are edited in the code.
 */

type FooterLink = { label: string; href?: string; external?: boolean }
type FooterColumn = { title: string; links: FooterLink[] }

// Etiqueta del enlace cuyo destino (WhatsApp con el mensaje guardado) sólo se
// puede calcular dentro del componente: el número y el mensaje son asíncronos.
const SELL_WITH_US_LABEL = 'Vende con nosotros'

const COLUMNS: FooterColumn[] = [
  {
    title: 'Servicio al cliente',
    links: [
      { label: 'Preguntas frecuentes' },
      { label: 'Rastrea tu pedido' },
      { label: 'Cambios y devoluciones' },
      { label: 'Centro de ayuda' },
    ],
  },
  {
    title: 'Compañía',
    links: [
      { label: 'Sobre nosotros' },
      { label: SELL_WITH_US_LABEL, external: true },
      { label: 'Trabaja con nosotros' },
      { label: 'Mapa del sitio' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Términos y condiciones' },
      { label: 'Política de protección de datos' },
      { label: 'Estatuto del consumidor', href: 'https://www.sic.gov.co/', external: true },
    ],
  },
]

// Only real URLs are listed: the brand has not published its profiles yet.
const SOCIAL_LINKS: FooterLink[] = [
  { label: 'Facebook' },
  { label: 'Instagram' },
  { label: 'X' },
  { label: 'YouTube' },
  { label: 'WhatsApp', href: whatsappUrl(), external: true },
]

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  Facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.5-1.5h1.4V4.9c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H8.5v3H11v7h2.5z" />
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  X: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M17.7 4h2.6l-5.7 6.5L21.3 20h-5.2l-4.1-6.1L7 20H4.4l6.1-7L3.7 4h5.3l3.7 5.6L17.7 4zm-.9 14.4h1.4L7.6 5.5H6.1l10.7 12.9z" />
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M21.6 8.2a2.5 2.5 0 0 0-1.8-1.8C18.3 6 12 6 12 6s-6.3 0-7.8.4A2.5 2.5 0 0 0 2.4 8.2 26 2.5 0 0 0 2 12a26 2.5 0 0 0 .4 3.8 2.5 2.5 0 0 0 1.8 1.8c1.5.4 7.8.4 7.8.4s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 2.5 0 0 0 22 12a26 2.5 0 0 0-.4-3.8zM10 15V9l5.2 3L10 15z" />
    </svg>
  ),
  WhatsApp: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm0 16.3a7.3 7.3 0 0 1-3.7-2l-.3-.3-2.7.7.7-2.6-.2-.3A7.3 7.3 0 1 1 12 19.3zm4.1-5.4c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.4.3-.6.1a6 6 0 0 1-3-2.6c-.2-.3 0-.4.1-.6l.5-.6c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.9.9-.9 2.1.1 3.7a9.7 9.7 0 0 0 3.9 3.5c1.5.7 2.3.7 3 .6.5-.1 1.3-.6 1.5-1.1.2-.5.2-1 .1-1.1l-.5-.3z" />
    </svg>
  ),
}

function hasHref(link: FooterLink): link is FooterLink & { href: string } {
  return link.href !== undefined
}

const LINK_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

const GRID_BY_COLUMNS: Record<number, string> = {
  0: 'sm:grid-cols-1 lg:grid-cols-1',
  1: 'sm:grid-cols-2 lg:grid-cols-2',
  2: 'sm:grid-cols-2 lg:grid-cols-3',
  3: 'sm:grid-cols-2 lg:grid-cols-4',
  4: 'sm:grid-cols-2 lg:grid-cols-5',
}

function FooterLinkList({ title, links }: { title: string; links: Array<FooterLink & { href: string }> }) {
  return (
    <nav aria-labelledby={`footer-${title}-title`}>
      <h2 id={`footer-${title}-title`} className="mb-4 text-sm font-bold text-white">
        {title}
      </h2>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className={`inline-flex min-h-6 items-center text-sm text-slate-300 transition hover:text-white hover:underline ${LINK_FOCUS}`}
              {...(link.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default function StorefrontFooter() {
  const { contact } = useStorefrontContact()
  const columns = COLUMNS.map((column) => ({
    title: column.title,
    links: column.links
      .map((link) =>
        // "Vende con nosotros" lleva el número y el mensaje guardados; sin
        // resolverlo aquí perdería su `href` y desaparecería del filtro.
        link.label === SELL_WITH_US_LABEL
          ? { ...link, href: contact.whatsappUrl(contact.sellWithUsMessage) }
          : link,
      )
      .filter(hasHref),
  })).filter((column) => column.links.length > 0)
  const socials = SOCIAL_LINKS.filter(hasHref)

  return (
    <footer className="bg-[#1A1A1A] px-5 py-10 text-slate-300 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className={`grid grid-cols-1 gap-8 ${GRID_BY_COLUMNS[columns.length] ?? GRID_BY_COLUMNS[3]}`}>
          {columns.map((column) => (
            <FooterLinkList key={column.title} title={column.title} links={column.links} />
          ))}
          <div aria-labelledby="footer-contacto-title">
            <h2 id="footer-contacto-title" className="mb-4 text-sm font-bold text-white">
              Contacto
            </h2>
            <ul className="space-y-2.5 text-sm">
              {contact.salesLineHref !== null && (
                <li>
                  <a
                    href={contact.salesLineHref}
                    className={`transition hover:text-white hover:underline ${LINK_FOCUS}`}
                  >
                    Línea de ventas: {contact.salesLineDisplay}
                  </a>
                </li>
              )}
              <li>
                <a
                  href={contact.nationalPhoneHref}
                  className={`transition hover:text-white hover:underline ${LINK_FOCUS}`}
                >
                  Línea nacional: {contact.nationalPhoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className={`transition hover:text-white hover:underline ${LINK_FOCUS}`}
                >
                  {contact.email}
                </a>
              </li>
              <li>Horario de atención: {contact.businessHours}</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center gap-4 border-t border-slate-700 pt-6 text-xs sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} Grupo Security S.A.S. Todos los derechos reservados. · NIT 900.000.000-0 (demo)
          </p>
          {socials.length > 0 && (
            <ul className="flex items-center gap-2">
              {socials.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    aria-label={social.label}
                    title={social.label}
                    className={`flex h-11 w-11 items-center justify-center text-slate-300 transition hover:text-white ${LINK_FOCUS}`}
                    {...(social.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                  >
                    <span className="sr-only">{social.label}</span>
                    {SOCIAL_ICONS[social.label]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  )
}
