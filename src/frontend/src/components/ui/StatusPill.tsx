import type { ReactNode } from 'react'

export type PillTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'info'

/**
 * Insignia compacta del diseño de dashboards (Actualizado / Pendiente / Alta…).
 *
 * Se distingue del `Badge` existente en que aquí el color es *tono semántico*,
 * no variante de marca, y la caja es más estrecha porque va dentro de filas de
 * tabla.
 *
 * El color nunca es el único portador del significado: el texto de la insignia
 * siempre nombra el estado, de modo que sigue siendo legible en escala de
 * grises o para quien no distingue esos tonos.
 */
const toneClasses: Record<PillTone, string> = {
  success: 'bg-[#ECFDF5] text-[#047857]',
  warning: 'bg-[#FFFBEB] text-[#B45309]',
  danger: 'bg-[#FEF2F2] text-[#DC2626]',
  neutral: 'bg-surface-100 text-ink-500',
  info: 'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]',
}

interface StatusPillProps {
  tone?: PillTone
  children: ReactNode
  className?: string
}

export default function StatusPill({
  tone = 'neutral',
  children,
  className = '',
}: StatusPillProps) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-micro font-semibold ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Prioridades del diseño, con su tono fijo. */
export const PRIORITY_TONES = {
  Alta: 'danger',
  Media: 'warning',
  Baja: 'neutral',
} as const satisfies Record<string, PillTone>
