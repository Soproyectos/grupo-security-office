import type { ReactNode } from 'react'

/** Lets a host page own the card, title and anchor of a block (embedded editor). */
export type RenderFichaSection = (section: { id: string; title: string; hint?: string; children: ReactNode }) => ReactNode

/** Card with a titled heading used by every block of the "Ficha" tab. */
export function FichaSection({
  id,
  title,
  hint,
  flat = false,
  renderSection,
  children,
}: {
  id: string
  title: string
  hint?: string
  /** Inside another card: no own border, only a divider between blocks. */
  flat?: boolean
  /** When present, the host renders the card (title, hint, anchor) and this block only supplies its content. */
  renderSection?: RenderFichaSection
  children: ReactNode
}) {
  if (renderSection) return <>{renderSection({ id, title, hint, children })}</>
  return (
    <section
      id={`ficha-${id}`}
      aria-labelledby={`ficha-${id}-title`}
      className={flat ? 'border-t border-neutral-200 pt-6 first:border-t-0 first:pt-0 space-y-4 scroll-mt-24' : 'border border-neutral-200 rounded-xl p-5 space-y-4 scroll-mt-24'}
    >
      <div>
        <h3 id={`ficha-${id}-title`} className="text-base font-semibold text-neutral-800">
          {title}
        </h3>
        {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}
