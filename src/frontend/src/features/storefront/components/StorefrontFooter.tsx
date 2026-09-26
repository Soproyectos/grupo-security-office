/**
 * As HOM-03 defines it, the full footer of the storefront (Homecenter style):
 * dark background with the red accent, responsive link columns, demo contact
 * info and a bottom row with the copyright, the demo NIT and social icons.
 *
 * The destinations of the internal links are intended routes that do not exist
 * yet (no route was created in this task): they use plain `<a href>` so a
 * visitor without JavaScript still sees where each link leads. When the routes
 * land, each anchor can be swapped for a `Link` from react-router.
 */

type FooterLink = { label: string; href: string; external?: boolean }

const CUSTOMER_SERVICE_LINKS: FooterLink[] = [
  { label: 'Preguntas frecuentes', href: '/preguntas-frecuentes' },
  { label: 'Rastrea tu pedido', href: '/rastrea-tu-pedido' },
  { label: 'Cambios y devoluciones', href: '/cambios-y-devoluciones' },
  { label: 'Centro de ayuda', href: '/centro-de-ayuda' },
]

const COMPANY_LINKS: FooterLink[] = [
  { label: 'Sobre nosotros', href: '/sobre-nosotros' },
  { label: 'Vende con nosotros', href: '/vende-con-nosotros' },
  { label: 'Trabaja con nosotros', href: '/trabaja-con-nosotros' },
  { label: 'Mapa del sitio', href: '/mapa-del-sitio' },
]

const LEGAL_LINKS: FooterLink[] = [
  { label: 'Términos y condiciones', href: '/terminos-y-condiciones' },
  { label: 'Política de protección de datos', href: '/politica-proteccion-datos' },
  { label: 'Estatuto del consumidor', href: 'https://www.sic.gov.co/', external: true },
]

const SOCIAL_LINKS: FooterLink[] = [
  { label: 'Facebook', href: '#' },
  { label: 'Instagram', href: '#' },
  { label: 'X', href: '#' },
  { label: 'YouTube', href: '#' },
  { label: 'WhatsApp', href: '#' },
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

function FooterLinkList({ title, links }: { title: string; links: FooterLink[] }) {
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
              className="text-sm text-slate-300 transition hover:text-[#CE0203]"
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
  return (
    <footer className="bg-[#1A1A1A] px-5 py-10 text-slate-300 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <FooterLinkList title="Servicio al cliente" links={CUSTOMER_SERVICE_LINKS} />
          <FooterLinkList title="Compañía" links={COMPANY_LINKS} />
          <FooterLinkList title="Legal" links={LEGAL_LINKS} />
          <div aria-labelledby="footer-contacto-title">
            <h2 id="footer-contacto-title" className="mb-4 text-sm font-bold text-white">
              Contacto
            </h2>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="tel:+5761234567" className="transition hover:text-[#CE0203]">
                  Línea de ventas: (6) 123 4567
                </a>
              </li>
              <li>
                <a href="tel:+576011234567" className="transition hover:text-[#CE0203]">
                  Línea nacional: (601) 123 4567
                </a>
              </li>
              <li>
                <a href="mailto:serviciocliente@gruposecurity.example" className="transition hover:text-[#CE0203]">
                  serviciocliente@gruposecurity.example
                </a>
              </li>
              <li>
                Horario de atención: lunes a sábado de 7:00 a.m. a 7:00 p.m. · domingos y festivos de 8:00 a.m. a 2:00 p.m.
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center gap-4 border-t border-slate-700 pt-6 text-xs sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} Grupo Security S.A.S. Todos los derechos reservados. · NIT 900.000.000-0 (demo)
          </p>
          <ul className="flex items-center gap-4">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  aria-label={social.label}
                  title={social.label}
                  className="block text-slate-300 transition hover:text-[#CE0203]"
                >
                  <span className="sr-only">{social.label}</span>
                  {SOCIAL_ICONS[social.label]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
