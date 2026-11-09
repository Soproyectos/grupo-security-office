import { useEffect, useRef, type ReactNode } from 'react'
import type { AccessActionDefinition } from '../../../services/users.service'
import { actionLabel } from '../access'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
const BOX = `h-4 w-4 shrink-0 accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`
const ROW = 'flex min-h-11 items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--color-bg-surface-hover)] md:min-h-7 md:py-0.5'

export function PermissionGroup({ label, state, disabled, onToggle, children, tree = false }: {
  label: string
  state: 'all' | 'some' | 'none'
  disabled: boolean
  onToggle: () => void
  children: ReactNode
  tree?: boolean
}) {
  const checkbox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = state === 'some'
  }, [state])
  if (tree) return (
    <details className="access-tree-group">
      <summary className="access-tree-summary">
        <span className="min-w-0 flex-1 font-semibold">{label}</span>
        <input ref={checkbox} type="checkbox" className={BOX} checked={state === 'all'} aria-checked={state === 'some' ? 'mixed' : state === 'all'} disabled={disabled} aria-label={`${label}: marcar o desmarcar todo`} onClick={(event) => event.stopPropagation()} onChange={onToggle} />
      </summary>
      <div className="access-tree-content">{children}</div>
    </details>
  )
  return (
    <fieldset aria-label={label} className="min-w-0 rounded border border-[var(--color-border)] p-2">
      <label className={`${ROW} font-semibold`}>
        <input ref={checkbox} type="checkbox" className={BOX} checked={state === 'all'} aria-checked={state === 'some' ? 'mixed' : state === 'all'} disabled={disabled} aria-label={`${label}: marcar o desmarcar todo`} onChange={onToggle} />
        <span>{label}</span>
      </label>
      {children}
    </fieldset>
  )
}

export function AccessPermissionGrid({ groups, selected, inherited, disabled, onToggle, onToggleGroup, renderOptions, embedded = false, tree = false, inheritedLabel }: {
  groups: { label: string; hint?: string; actions: AccessActionDefinition[] }[]
  selected: ReadonlySet<string>
  inherited: ReadonlySet<string>
  disabled: boolean
  onToggle: (actionId: string, checked: boolean) => void
  onToggleGroup: (actionIds: string[], checked: boolean) => void
  renderOptions: (actionId: string, includedInPackage: boolean) => ReactNode
  embedded?: boolean
  tree?: boolean
  inheritedLabel?: (actionId: string) => string | undefined
}) {
  return (
    <div className={tree ? 'access-tree' : embedded ? 'contents' : 'grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-5'}>
      {groups.filter((group) => group.actions.length > 0).map((group) => {
        const checked = group.actions.filter((action) => selected.has(action.id) || inherited.has(action.id)).length
        const editable = group.actions.filter((action) => !inherited.has(action.id) && action.allowedScopes.length > 0)
        const state = checked === 0 ? 'none' : checked === group.actions.length ? 'all' : 'some'
        return (
          <PermissionGroup key={group.label} label={group.label} state={state} disabled={disabled || editable.length === 0} onToggle={() => onToggleGroup(editable.map((action) => action.id), state !== 'all')} tree={tree}>
            {group.hint && <p className="px-1.5 pb-1 text-xs text-[var(--color-text-secondary)]">{group.hint}</p>}
            <ul>
              {group.actions.map((action) => {
                const included = inherited.has(action.id)
                return (
                  <li key={action.id}>
                    <label className={ROW} title={included ? 'Incluido en un paquete. Retira ese paquete para quitar este acceso.' : action.purpose}>
                      <input type="checkbox" aria-label={action.label} className={BOX} checked={selected.has(action.id) || included} disabled={disabled || included || !action.allowedScopes.length} onChange={(event) => onToggle(action.id, event.target.checked)} />
                      <span className="min-w-0 break-words">{action.label}{included && <span className="ml-1 text-xs text-[var(--color-text-secondary)]">({inheritedLabel?.(action.id) ?? 'por paquete'})</span>}</span>
                    </label>
                    {renderOptions(action.id, included)}
                  </li>
                )
              })}
            </ul>
            <details className="mt-1 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
              <summary className={`min-h-11 cursor-pointer px-1.5 py-1 md:min-h-7 ${FOCUS}`}>Detalles de acciones</summary>
              <dl className="space-y-2 px-1.5 py-1">
                {group.actions.map((action) => <div key={action.id} className="break-words"><dt className="font-medium">{action.label} <code>{action.id}</code></dt><dd>{action.purpose}{action.dependencies.length ? ` Requiere: ${action.dependencies.map(actionLabel).join(', ')}.` : ''}</dd></div>)}
              </dl>
            </details>
          </PermissionGroup>
        )
      })}
    </div>
  )
}
