import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface BlockShellProps {
  title: string
  /** Enlace "Ver todo →" de la esquina superior derecha. */
  linkTo?: string
  linkLabel?: string
  children: ReactNode
  /** Contenido extra junto al título (contadores, insignias). */
  aside?: ReactNode
}

/**
 * Marco común de los paneles del dashboard: encabezado con título, enlace
 * opcional y el contenido debajo.
 *
 * Existe para que los 24 paneles del catálogo compartan el mismo encabezado sin
 * repetirlo. Cada bloque aporta sólo su contenido.
 */
export default function BlockShell({
  title,
  linkTo,
  linkLabel = 'Ver todo',
  children,
  aside,
}: BlockShellProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-panel-title text-ink-900">{title}</h2>
          {aside}
        </div>

        {linkTo && (
          <Link
            to={linkTo}
            className="text-body-sm font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            {linkLabel} →
          </Link>
        )}
      </div>

      {children}
    </section>
  )
}
