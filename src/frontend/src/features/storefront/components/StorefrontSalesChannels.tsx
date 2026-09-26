/**
 * As HOM-04 defines it, the sales-channels section of the storefront
 * (Homecenter style): four channels with inline SVG icons, a short title and
 * a one-line description each. Every phone number and WhatsApp link is DEMO
 * (the same demo pattern of the footer contact), no real PII.
 *
 * The destinations of the internal channels (`Proyectos`, `Ventas al por
 * mayor`) are intended routes that do not exist yet (no route was created in
 * this task): they use plain `<a href>` so a visitor without JavaScript still
 * sees where each link leads. When the routes land, each anchor can be
 * swapped for a `Link` from react-router.
 */

type SalesChannel = {
  title: string
  description: string
  href: string
  external?: boolean
  icon: React.ReactNode
}

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm0 16.3a7.3 7.3 0 0 1-3.7-2l-.3-.3-2.7.7.7-2.6-.2-.3A7.3 7.3 0 1 1 12 19.3zm4.1-5.4c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.4.3-.6.1a6 6 0 0 1-3-2.6c-.2-.3 0-.4.1-.6l.5-.6c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.9.9-.9 2.1.1 3.7a9.7 9.7 0 0 0 3.9 3.5c1.5.7 2.3.7 3 .6.5-.1 1.3-.6 1.5-1.1.2-.5.2-1 .1-1.1l-.5-.3z" />
  </svg>
)

const PHONE_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
    <path d="M6.6 3h2.2c.4 0 .8.3.9.7l1 3.2c.1.4 0 .8-.3.6l-1.8 1a12.6 12.6 0 0 0 5.9 5.9l1-1.8c.2-.3.6-.4 1-.3l3.2 1c.4.1.7.5.7.9v2.2c0 1.4-1.1 2.6-2.5 2.5C9.9 18.4 5.6 14.1 5.1 6.1 5 4.7 6.2 3 6.6 3z" />
  </svg>
)

const PROJECTS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
    <path d="M4 20V7l8-4 8 4v13" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 20v-5h6v5" strokeLinejoin="round" />
    <path d="M4 20h16" strokeLinecap="round" />
  </svg>
)

const WHOLESALE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
    <rect x="3.5" y="10.5" width="7" height="9" rx="1" />
    <rect x="13.5" y="10.5" width="7" height="9" rx="1" />
    <path d="M12 4.5h-5.2L4.5 10.5h7.5l-1.6-6zM12 4.5h5.2l2.3 6H12l-1.6-6" strokeLinejoin="round" />
  </svg>
)

const SALES_CHANNELS: SalesChannel[] = [
  {
    title: 'WhatsApp',
    description: 'Escríbenos por WhatsApp y te asesoramos en tu compra.',
    href: 'https://wa.me/576011234567',
    external: true,
    icon: WHATSAPP_ICON,
  },
  {
    title: 'Venta telefónica',
    description: 'Llama a nuestra línea de ventas y haz tu pedido.',
    href: 'tel:+5761234567',
    icon: PHONE_ICON,
  },
  {
    title: 'Proyectos',
    description: 'Cotiza proyectos de seguridad para tu empresa o edificio.',
    href: '/proyectos',
    icon: PROJECTS_ICON,
  },
  {
    title: 'Ventas al por mayor',
    description: 'Precios especiales por volumen para distribuidores e instaladores.',
    href: '/ventas-al-por-mayor',
    icon: WHOLESALE_ICON,
  },
]

export default function StorefrontSalesChannels() {
  return (
    <section aria-labelledby="home-canales-title" className="mt-12">
      <h2 id="home-canales-title" className="text-xl font-bold text-ink-900">
        Canales de venta
      </h2>
      <ul role="list" className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SALES_CHANNELS.map((channel) => (
          <li key={channel.title}>
            <a
              href={channel.href}
              className="flex h-full flex-col gap-2 rounded-card border border-surface-200 bg-white p-5 transition hover:border-security-500 hover:shadow-lg"
              {...(channel.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-security-50 text-security-500">
                {channel.icon}
              </span>
              <span className="font-semibold text-ink-900">{channel.title}</span>
              <span className="text-body-sm text-ink-500">{channel.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
