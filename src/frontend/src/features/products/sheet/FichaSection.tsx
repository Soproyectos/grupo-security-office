import type { ReactNode } from 'react'

/** Card with a titled heading used by every block of the "Ficha" tab. */
export function FichaSection({
  id,
  title,
  hint,
  children,
}: {
  id: string
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section
      id={`ficha-${id}`}
      aria-labelledby={`ficha-${id}-title`}
      className="border border-neutral-200 rounded-xl p-5 space-y-4 scroll-mt-24"
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
