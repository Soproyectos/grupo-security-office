import { useState } from 'react'
import type { ReviewIssueGroup } from './review-issues.utils'

const PREVIEW_LIMIT = 10

function IssueGroup({ group, defaultOpen }: { group: ReviewIssueGroup; defaultOpen: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? group.items : group.items.slice(0, PREVIEW_LIMIT)
  const tone = group.severity === 'error' ? '--color-error' : '--color-warning'
  return (
    <details open={defaultOpen} className="border-t border-[var(--color-border)] first:border-t-0">
      <summary
        className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] sm:min-h-0"
        style={{ backgroundColor: `var(${tone}-bg-subtle)` }}
      >
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `var(${tone})`, color: group.severity === 'error' ? 'var(--color-text-inverse)' : 'var(--color-text-primary)' }}>{group.count}</span>
        <span className="font-semibold text-[var(--color-text-primary)]">{group.title}</span>
        <span className="text-[var(--color-text-secondary)]">{group.effect}</span>
      </summary>
      <div className="min-w-0 overflow-x-auto px-3 pb-3 pt-1">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="text-xs text-[var(--color-text-secondary)]">
            <tr><th scope="col" className="py-1 pr-3">Fila</th><th scope="col" className="py-1 pr-3">Referencia</th><th scope="col" className="py-1">Detalle</th></tr>
          </thead>
          <tbody>
            {visible.map((item, index) => (
              <tr key={`${item.row ?? 'x'}-${index}`} className="border-t border-[var(--color-border)] align-top">
                <td className="whitespace-nowrap py-1.5 pr-3">{item.row ?? '—'}</td>
                <td className="py-1.5 pr-3 font-mono">{item.reference || '—'}</td>
                <td className="py-1.5">{item.column ? `${item.column}: ` : ''}{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {group.items.length > PREVIEW_LIMIT && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mt-2 min-h-[44px] rounded-lg px-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] sm:min-h-0 sm:py-1"
          >
            {showAll ? 'Ver menos' : `Ver todas (${group.items.length})`}
          </button>
        )}
      </div>
    </details>
  )
}

/** Problems of the review grouped by kind, each group collapsible. */
export default function PriceReviewIssues({ groups }: { groups: ReviewIssueGroup[] }) {
  if (groups.length === 0) return null
  return (
    <section aria-label="Problemas encontrados" className="min-w-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      {groups.map((group, index) => <IssueGroup key={group.id} group={group} defaultOpen={index === 0} />)}
    </section>
  )
}
