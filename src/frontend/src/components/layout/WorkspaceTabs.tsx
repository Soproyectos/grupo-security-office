import type { ReactNode } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router-dom'
import './library-workspace.css'

/**
 * Tab bar shared by every internal panel with two or more pages: small icon,
 * short name and a help text on the right. It is the Biblioteca look
 * (`biblioteca-workspace__*` classes in library-workspace.css) as a component.
 * See docs/PATRON-PANELES-CON-PESTANAS.md.
 */
export interface WorkspaceTab {
  id: string
  /** Short name, one or two words. */
  label: string
  /** SVG path data (24x24 viewBox, 1.6 stroke), drawn with currentColor. */
  icon: string
  /** One-line help shown on the right while this tab is the active one. */
  hint: string
  /** Optional count shown next to the name (leave undefined to hide it). */
  badge?: number | string
}

/** A tab that navigates to its own route. */
export interface WorkspaceRouteTab extends WorkspaceTab {
  to: string
  end?: boolean
}

/**
 * - `workspace`: only the bar; the parent already is a `.biblioteca-workspace` (Biblioteca).
 * - `standalone`: the bar wrapped on its own, for layouts that keep their own page container.
 * - `header`: like `standalone`, without the bottom line, to sit at the end of an app header that already has one.
 */
export type WorkspaceTabsVariant = 'workspace' | 'standalone' | 'header'

interface BaseProps {
  /** Panel name. Kept for screen readers only (the active tab already tells where the person is). */
  title?: string
  /** Accessible name of the tab navigation. */
  navLabel: string
  variant?: WorkspaceTabsVariant
}

interface StateProps extends BaseProps {
  mode: 'state'
  tabs: readonly WorkspaceTab[]
  activeId: string
  onChange: (id: string) => void
}

interface RouteProps extends BaseProps {
  mode: 'route'
  tabs: readonly WorkspaceRouteTab[]
  /** Extra links after the tabs (for example a link that opens another site). */
  trailing?: ReactNode
}

export type WorkspaceTabsProps = StateProps | RouteProps

export function WorkspaceTabIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function Badge({ value }: { value: number | string | undefined }) {
  if (value === undefined) return null
  return <span className="rounded-full bg-[var(--color-warning-bg-subtle)] px-2 text-xs text-[var(--color-warning-hover)]">{value}</span>
}

function Bar({ title, hint, variant = 'workspace', children }: { title?: string; hint?: string; variant?: WorkspaceTabsVariant; children: ReactNode }) {
  const bar = (
    <div className="biblioteca-workspace__bar">
      {title && <h1 className="biblioteca-workspace__label">{title}</h1>}
      {children}
      {hint && <p className="biblioteca-workspace__hint">{hint}</p>}
    </div>
  )
  if (variant === 'workspace') return bar
  return <div className={`biblioteca-workspace biblioteca-workspace--standalone${variant === 'header' ? ' biblioteca-workspace--header' : ''}`}>{bar}</div>
}

function StateTabs({ title, navLabel, variant, tabs, activeId, onChange }: StateProps) {
  const active = tabs.find(tab => tab.id === activeId)
  return (
    <Bar title={title} hint={active?.hint} variant={variant}>
      <nav role="tablist" aria-label={navLabel} className="biblioteca-workspace__nav">
        {tabs.map(tab => (
          <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`} type="button" aria-selected={tab.id === activeId}
            onClick={() => onChange(tab.id)} className={`biblioteca-workspace__destination${tab.id === activeId ? ' is-active' : ''}`}>
            <WorkspaceTabIcon path={tab.icon} />
            {tab.label}
            <Badge value={tab.badge} />
          </button>
        ))}
      </nav>
    </Bar>
  )
}

function RouteTabs({ title, navLabel, variant, tabs, trailing }: RouteProps) {
  const { pathname } = useLocation()
  const active = tabs.find(tab => matchPath({ path: tab.to, end: tab.end ?? false }, pathname))
  return (
    <Bar title={title} hint={active?.hint} variant={variant}>
      <nav aria-label={navLabel} className="biblioteca-workspace__nav">
        {tabs.map(tab => (
          <NavLink key={tab.id} to={tab.to} end={tab.end} className={({ isActive }) => `biblioteca-workspace__destination${isActive ? ' is-active' : ''}`}>
            <WorkspaceTabIcon path={tab.icon} />
            {tab.label}
            <Badge value={tab.badge} />
          </NavLink>
        ))}
        {trailing}
      </nav>
    </Bar>
  )
}

export default function WorkspaceTabs(props: WorkspaceTabsProps) {
  return props.mode === 'state' ? <StateTabs {...props} /> : <RouteTabs {...props} />
}
