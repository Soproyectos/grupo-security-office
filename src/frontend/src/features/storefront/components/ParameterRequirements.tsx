import { useState } from 'react'
import type { PublicKeySpecFacet } from '../../../services/public-catalog.service'

const VISIBLE_OPTIONS = 6
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'

/**
 * Options to show for one facet. Options with no products are hidden unless they
 * are selected; when collapsed, only the first six are shown plus any selected one.
 */
export function visibleFacetOptions(
  facet: Pick<PublicKeySpecFacet, 'specKey' | 'values'>,
  selected: ReadonlySet<string>,
  expanded: boolean,
): { options: PublicKeySpecFacet['values']; visible: PublicKeySpecFacet['values'] } {
  const options = facet.values.filter((option) => option.count > 0 || selected.has(`${facet.specKey}:${option.value}`))
  const visible = expanded ? options : options.filter((option, index) =>
    index < VISIBLE_OPTIONS || selected.has(`${facet.specKey}:${option.value}`),
  )
  return { options, visible }
}

function ParameterChecklist({ facet, selected, atLimit, onToggle }: {
  facet: PublicKeySpecFacet
  selected: ReadonlySet<string>
  atLimit: boolean
  onToggle: (filter: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { options, visible } = visibleFacetOptions(facet, selected, expanded)

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-semibold text-ink-800">
        {facet.label}{facet.unit && ` (${facet.unit})`}
      </legend>
      <div>
        {visible.map((option) => {
          const filter = `${facet.specKey}:${option.value}`
          const checked = selected.has(filter)
          const disabled = (atLimit || option.count === 0) && !checked
          return (
            <label key={option.value} className={`flex min-h-11 items-center gap-2 rounded-control px-1.5 py-2 text-sm ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-100'}`}>
              <input
                type="checkbox"
                className={`size-4 shrink-0 accent-security-600 ${FOCUS}`}
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(filter)}
              />
              <span className="min-w-0 flex-1 break-words text-ink-800">{option.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-600">({option.count})</span>
            </label>
          )
        })}
      </div>
      {options.length > VISIBLE_OPTIONS && (
        <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
          className={`min-h-11 rounded-control px-1.5 text-sm font-semibold text-security-600 hover:underline ${FOCUS}`}>
          {expanded ? 'Ver menos opciones' : `Ver las ${options.length} opciones`}
        </button>
      )}
    </fieldset>
  )
}

export default function ParameterRequirements({ facets, selected, maxSelections, truncated = false, onToggle }: {
  facets: PublicKeySpecFacet[]
  selected: readonly string[]
  maxSelections: number
  truncated?: boolean
  onToggle: (filter: string) => void
}) {
  const selectedSet = new Set(selected)
  const atLimit = selectedSet.size >= maxSelections
  return (
    <div className="space-y-4">
      {atLimit && <p role="status" className="text-sm text-ink-600">Puedes marcar hasta {maxSelections} requisitos.</p>}
      {facets.filter((facet) => visibleFacetOptions(facet, selectedSet, false).options.length > 0).map((facet) => (
        <ParameterChecklist key={facet.specKey} facet={facet} selected={selectedSet} atLimit={atLimit} onToggle={onToggle} />
      ))}
      {truncated && (
        <p role="status" className="text-sm text-ink-600">Hay más requisitos de los que podemos mostrar. Elige una subcategoría o usa la búsqueda para afinar.</p>
      )}
    </div>
  )
}
