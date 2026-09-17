import { NavLink, Outlet } from 'react-router-dom'

const COMMERCIAL_TABS = [
  { to: '/commercial/products', label: 'Productos', end: true },
  { to: '/commercial/lists', label: 'Listas', end: false },
  { to: '/commercial/customers', label: 'Clientes', end: false },
  { to: '/commercial/quotes', label: 'Cotizaciones', end: false },
  { to: '/commercial/settings', label: 'Configuraci\u00f3n', end: false },
]

const VISIBLE_TABS = COMMERCIAL_TABS

export default function CommercialLayout() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="w-full px-4">
        <div className="border-b border-[var(--color-border)]">
          <div className="flex items-center overflow-x-auto scrollbar-thin">
            {VISIBLE_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `px-3 py-2.5 text-sm font-condensed font-semibold whitespace-nowrap transition-all tracking-wider border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                    isActive
                      ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-primary)]'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>

        <main className="py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
