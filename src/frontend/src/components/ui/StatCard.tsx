import type { ReactNode } from 'react'

export type StatCardVariant = 'default' | 'warning' | 'success'

interface StatCardProps {
  /** Etiqueta superior, en versalitas. */
  label: string
  /** Cifra principal. Ya formateada: la tarjeta no decide formato. */
  value: ReactNode
  /** Línea de apoyo bajo la cifra. */
  hint?: ReactNode
  variant?: StatCardVariant
  loading?: boolean
  error?: boolean
  /** Si se indica, la tarjeta completa se vuelve un enlace. */
  href?: string
  onClick?: () => void
}

/**
 * Tarjeta de KPI del diseño de dashboards.
 *
 * La variante `warning` no es sólo un color de texto: cambia el fondo y el
 * borde de la tarjeta entera (ámbar), porque en el diseño señala cifras que
 * exigen acción — "Pendientes de actualizar", "Listas por vencer". Depender
 * sólo del color sería insuficiente para quien no lo distingue, así que la
 * etiqueta de esas tarjetas nombra siempre la condición.
 */
const variantClasses: Record<StatCardVariant, { box: string; label: string; hint: string }> = {
  default: {
    box: 'bg-[var(--color-bg-card)] border-surface-200',
    label: 'text-ink-400',
    hint: 'text-ink-400',
  },
  warning: {
    box: 'bg-[#FFFBEB] border-[#FDE68A]',
    label: 'text-[#B45309]',
    hint: 'text-[#B45309]',
  },
  success: {
    box: 'bg-[var(--color-bg-card)] border-surface-200',
    label: 'text-ink-400',
    hint: 'text-[var(--color-success)]',
  },
}

export default function StatCard({
  label,
  value,
  hint,
  variant = 'default',
  loading = false,
  error = false,
  href,
  onClick,
}: StatCardProps) {
  const styles = variantClasses[variant]

  const content = (
    <>
      <p className={`text-eyebrow uppercase ${styles.label}`}>{label}</p>

      {loading ? (
        <div className="mt-2.5 h-7 w-20 animate-pulse rounded bg-surface-200" aria-hidden />
      ) : error ? (
        <p className="mt-2.5 text-metric font-condensed text-[var(--color-error)]">—</p>
      ) : (
        <p className="mt-2.5 text-metric font-condensed text-ink-900">{value}</p>
      )}

      {hint && !loading && (
        <p className={`mt-1 text-micro ${styles.hint}`}>
          {error ? 'No se pudo cargar' : hint}
        </p>
      )}
    </>
  )

  const boxClass = `block rounded-card border p-[18px] text-left ${styles.box}`

  if (href) {
    return (
      <a href={href} className={`${boxClass} transition-colors hover:border-surface-300`}>
        {content}
      </a>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${boxClass} w-full transition-colors hover:border-surface-300`}>
        {content}
      </button>
    )
  }

  return <div className={boxClass}>{content}</div>
}

/** Esqueleto de carga con la misma caja, para evitar saltos de layout. */
export function StatCardSkeleton() {
  return <StatCard label="" value="" loading />
}
