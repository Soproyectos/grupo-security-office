import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '../../../components/ui'
import { LIMITS, appendItem, moveItem, newSpecGroup, removeAt, type SheetErrors, type SpecGroupRow } from './sheet-form'

const iconButtonClass =
  'min-h-[44px] md:min-h-0 px-3 md:px-2 py-1 text-xs rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed motion-safe:transition-colors motion-safe:duration-150'

const tabId = (uid: string) => `spec-tab-${uid}`
const panelId = (uid: string) => `spec-panel-${uid}`

/**
 * Master-detail editor for the specification groups, mirroring the store's
 * specifications block: the groups on the left (a scrollable chip row on small
 * screens) and only the selected group's rows on the right.
 */
export function SpecGroupsMasterDetail({
  groups,
  errors,
  onChange,
  renderPanel,
}: {
  groups: SpecGroupRow[]
  errors: SheetErrors
  onChange: (groups: SpecGroupRow[]) => void
  /** Renders the rows of one group (title, rows, add row). */
  renderPanel: (group: SpecGroupRow, index: number) => ReactNode
}) {
  const [selectedUid, setSelectedUid] = useState<string | null>(groups[0]?.uid ?? null)
  const [focusPanel, setFocusPanel] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const activeIndex = Math.max(0, groups.findIndex((g) => g.uid === selectedUid))
  const active = groups[activeIndex]

  // A new group takes the focus on its title so the person can type right away.
  useEffect(() => {
    if (!focusPanel) return
    panelRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus()
    setFocusPanel(false)
  }, [focusPanel, selectedUid])

  const hasError = (index: number) => Object.keys(errors).some((key) => key.startsWith(`specGroups.${index}.`))

  const addGroup = () => {
    const group = newSpecGroup()
    onChange(appendItem(groups, group))
    setSelectedUid(group.uid)
    setFocusPanel(true)
  }

  const removeActive = () => {
    if (!active) return
    const neighbour = groups[activeIndex + 1] ?? groups[activeIndex - 1]
    onChange(removeAt(groups, activeIndex))
    setSelectedUid(neighbour?.uid ?? null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : (activeIndex + step + groups.length) % groups.length
    const target = groups[next]
    if (!target) return
    setSelectedUid(target.uid)
    tabRefs.current[target.uid]?.focus()
  }

  return (
    <div className="space-y-3">
      <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 md:items-start space-y-3 md:space-y-0">
        <div className="flex md:flex-col gap-2 min-w-0" data-testid="spec-group-list">
          <div
            role="tablist"
            aria-label="Grupos de especificaciones"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
            className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible min-w-0 grow pb-1 md:pb-0"
          >
            {groups.map((group, index) => {
              const selected = group.uid === active?.uid
              const invalid = hasError(index)
              return (
                <button
                  key={group.uid}
                  ref={(el) => {
                    tabRefs.current[group.uid] = el
                  }}
                  id={tabId(group.uid)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId(group.uid)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setSelectedUid(group.uid)}
                  className={`shrink-0 flex min-h-[44px] md:min-h-[40px] items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] motion-safe:transition-colors motion-safe:duration-150 ${
                    selected
                      ? 'border-neutral-400 bg-neutral-100 font-semibold text-neutral-900'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <span className="whitespace-nowrap md:whitespace-normal md:break-words">{group.title.trim() || `Grupo ${index + 1}`}</span>
                  <span className={`shrink-0 text-xs font-normal ${invalid ? 'text-red-600' : 'text-neutral-600'}`}>
                    {invalid ? 'Revisar' : `${group.items.length} ${group.items.length === 1 ? 'fila' : 'filas'}`}
                  </span>
                </button>
              )
            })}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 min-h-[44px] self-start md:self-stretch"
            disabled={groups.length >= LIMITS.specGroups}
            onClick={addGroup}
          >
            Agregar grupo
          </Button>
        </div>

        <div className="min-w-0">
          {active ? (
            <div id={panelId(active.uid)} role="tabpanel" aria-labelledby={tabId(active.uid)} ref={panelRef} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-neutral-600">
                  Grupo {activeIndex + 1} de {groups.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Subir grupo ${activeIndex + 1}`}
                    disabled={activeIndex === 0}
                    onClick={() => onChange(moveItem(groups, activeIndex, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Bajar grupo ${activeIndex + 1}`}
                    disabled={activeIndex === groups.length - 1}
                    onClick={() => onChange(moveItem(groups, activeIndex, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${iconButtonClass} text-red-600 hover:bg-red-50`}
                    aria-label={`Quitar grupo ${activeIndex + 1}`}
                    onClick={removeActive}
                  >
                    Quitar
                  </button>
                </div>
              </div>
              {renderPanel(active, activeIndex)}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-600" data-testid="spec-empty">
              Agrega el primer grupo (por ejemplo, «Video y audio») para escribir sus especificaciones.
            </p>
          )}
        </div>
      </div>
      {groups.length >= LIMITS.specGroups && <p className="text-xs text-neutral-600">Llegaste al máximo de {LIMITS.specGroups} grupos.</p>}
    </div>
  )
}
