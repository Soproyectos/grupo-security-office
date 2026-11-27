import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCustomers } from '../../../services/customers.service'
import type { AdminAdvisor, AdminPortalAccount, AdminTier } from '../types/customer-portal.types'

export const STATE_LABELS: Record<string, string> = { ACTIVE: 'Activa', PENDING: 'Pendiente', REJECTED: 'Rechazada', SUSPENDED: 'Suspendida' }
const STATE_STYLE: Record<string, string> = {
  ACTIVE: 'bg-[var(--color-success-bg-subtle)] text-[var(--color-success-hover)]',
  PENDING: 'bg-[var(--color-warning-bg-subtle)] text-[var(--color-warning-hover)]',
  REJECTED: 'bg-[var(--color-error-bg-subtle)] text-[var(--color-error-hover)]',
  SUSPENDED: 'bg-[var(--color-error-bg-subtle)] text-[var(--color-error-hover)]',
}
const BUTTON = 'min-h-11 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY = 'min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50'
const DANGER = 'min-h-11 rounded-lg border border-[var(--color-error)] px-3 py-2 text-sm font-medium text-[var(--color-error-hover)] hover:bg-[var(--color-error-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-error)] disabled:cursor-not-allowed disabled:opacity-50'
const FIELD = 'mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60'

export interface AccountActions {
  assignAdvisor: (id: string, advisorId: string) => void
  assignTier: (id: string, tierId: string | null) => void
  link: (id: string, customerId: string | null) => void
  suspend: (id: string, reason: string) => void
  reactivate: (id: string) => void
  approve: (id: string, customerId?: string) => void
  reject: (id: string, reason: string) => void
}

type Mode = null | 'suspend' | 'reject'

/** Texto de la tarifa de la empresa: el nivel del cliente vinculado, o la tarifa general. */
export function companyTariffLabel(account: AdminPortalAccount, generalListName: string | null) {
  if (!account.customerId) return 'Sin tarifa: primero vincula un cliente'
  const tier = account.customer?.portalTier
  if (tier) return `Nivel ${tier.name}${tier.isActive ? '' : ' (inactivo)'}`
  return generalListName ? `Tarifa general: ${generalListName}` : 'Tarifa general'
}

/** Fila de una cuenta del portal con todo lo que el personal puede decidir sobre ella. */
export default function AdminAccountRow({ account, tiers, advisors, generalListName, busy, canAssign, canManage, actions }: {
  account: AdminPortalAccount
  tiers: AdminTier[]
  advisors: AdminAdvisor[]
  /** Nombre de la tarifa general que usan las empresas sin nivel (o null si no se conoce). */
  generalListName: string | null
  busy: boolean
  /** Puede asignar o cambiar el asesor. */
  canAssign: boolean
  /** Puede vincular cliente, poner tarifa, activar, rechazar y suspender. */
  canManage: boolean
  actions: AccountActions
}) {
  const [open, setOpen] = useState(account.state === 'PENDING')
  const [mode, setMode] = useState<Mode>(null)
  const [reason, setReason] = useState('')
  const currentTier = account.customer?.portalTierId ?? ''
  const [tierId, setTierId] = useState(currentTier)
  const [advisorId, setAdvisorId] = useState('')
  const [search, setSearch] = useState('')
  const term = search.trim()
  const found = useQuery({
    queryKey: ['portal-admin-customer-search', term],
    enabled: open && canManage && term.length >= 2,
    queryFn: () => fetchCustomers({ search: term }, 1, 6),
  })
  const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 300
  const tarifa = companyTariffLabel(account, generalListName)
  const isActive = account.state === 'ACTIVE'
  const linked = !!account.customerId
  const canTariff = canManage && account.state !== 'REJECTED'
  const noAdvisor = !account.advisorId
  const cityText = account.city ? `${account.city.name} · ${account.city.department}` : 'Sin ciudad'

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[var(--color-text-primary)]">{account.companyName}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[account.state] ?? ''}`}>{STATE_LABELS[account.state] ?? account.state}</span>
            {noAdvisor && account.state !== 'REJECTED' && <span className="rounded-full bg-[var(--color-warning-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning-hover)]">Sin asesor</span>}
            {account.deletionRequestedAt && <span className="rounded-full bg-[var(--color-error-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-error-hover)]">Pidió eliminar su cuenta</span>}
          </div>
          <p className="break-words text-sm text-[var(--color-text-secondary)]">{account.contactName} · {account.email}{account.phone ? ` · ${account.phone}` : ''}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">Ciudad: {cityText}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">Asesor: {account.advisor?.name ?? 'Sin asesor'}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">{account.customer ? `Vinculado a ${account.customer.name} (${account.customer.code})` : 'Sin cliente vinculado'}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">Tarifa de la empresa: {tarifa}</p>
        </div>
        {(canManage || canAssign) && <button type="button" className={BUTTON} aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Cerrar' : 'Gestionar'}<span className="sr-only"> la cuenta de {account.companyName}</span></button>}
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-lg bg-[var(--color-bg-surface)] p-4">
          {canAssign && (
            <div>
              <label className="block text-sm font-medium" htmlFor={`adv-${account.id}`}>{noAdvisor ? 'Asignar asesor' : 'Cambiar asesor'}</label>
              <p className="text-xs text-[var(--color-text-secondary)]">El asesor atiende a toda la empresa. Si lo cambias, también cambia para las demás personas de la misma empresa.</p>
              <div className="flex flex-wrap gap-2">
                <select id={`adv-${account.id}`} className={`${FIELD} max-w-sm flex-1`} value={advisorId} onChange={e => setAdvisorId(e.target.value)} disabled={busy || !advisors.length}>
                  <option value="">{advisors.length ? 'Elige un asesor' : 'No hay asesores disponibles'}</option>
                  {advisors.map(a => <option key={a.id} value={a.id} disabled={a.id === account.advisorId}>{a.name}{a.zone ? ` · ${a.zone}` : ''}{a.id === account.advisorId ? ' (actual)' : ''}</option>)}
                </select>
                <button type="button" className={`${BUTTON} mt-1 w-full sm:w-auto`} disabled={busy || !advisorId} onClick={() => { actions.assignAdvisor(account.id, advisorId); setAdvisorId('') }}>{noAdvisor ? 'Asignar asesor' : 'Cambiar asesor'}</button>
              </div>
            </div>
          )}

          {canManage && account.state === 'PENDING' && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-text-secondary)]">Esta cuenta espera tu decisión. Al aprobarla podrá ver precios y cotizar. Si no eliges un cliente abajo, se crea uno nuevo con sus datos.</p>
              {noAdvisor && <p className="text-sm text-[var(--color-warning-hover)]">Asigna un asesor antes de activar.{canAssign ? '' : ' Pídele a tu supervisor que lo asigne.'}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={PRIMARY} disabled={busy} onClick={() => actions.approve(account.id)}>Aprobar cuenta</button>
                <button type="button" className={DANGER} disabled={busy} onClick={() => { setMode('reject'); setReason('') }}>Rechazar</button>
              </div>
            </div>
          )}

          {canTariff && (
            <div>
              <label className="block text-sm font-medium" htmlFor={`tier-${account.id}`}>Tarifa de la empresa</label>
              <p className="text-xs text-[var(--color-text-secondary)]">{linked ? 'Aplica a todas las personas de esta empresa.' : 'Primero vincula la cuenta a un cliente.'}</p>
              <div className="flex flex-wrap gap-2">
                <select id={`tier-${account.id}`} className={`${FIELD} max-w-sm flex-1`} value={tierId} disabled={!linked || busy} onChange={e => setTierId(e.target.value)}>
                  <option value="">{generalListName ? `Tarifa general (${generalListName})` : 'Tarifa general'}</option>
                  {tiers.filter(t => t.isActive || t.id === currentTier).map(t => <option key={t.id} value={t.id} disabled={!t.isActive}>{t.name}{t.isActive ? '' : ' (inactivo)'}</option>)}
                </select>
                <button type="button" className={`${BUTTON} mt-1 w-full sm:w-auto`} disabled={busy || !linked || tierId === currentTier} onClick={() => actions.assignTier(account.id, tierId || null)}>Guardar tarifa</button>
              </div>
            </div>
          )}

          {canManage && (
            <div>
              <label className="block text-sm font-medium" htmlFor={`cust-${account.id}`}>Cliente de la empresa</label>
              <p className="text-xs text-[var(--color-text-secondary)]">Une esta cuenta con un cliente que ya tengas registrado. Busca por nombre, NIT o código.</p>
              <input id={`cust-${account.id}`} className={`${FIELD} max-w-sm`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Escribe al menos 2 letras" autoComplete="off" />
              {found.isFetching && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Buscando…</p>}
              {found.isError && <p role="alert" className="mt-2 text-sm text-[var(--color-error-hover)]">No se pudo buscar. Revisa que tengas permiso para ver clientes.</p>}
              {found.data && !found.data.data.length && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">No hay clientes con esa búsqueda.</p>}
              {!!found.data?.data.length && (
                <ul className="mt-2 divide-y divide-[var(--color-divider)] rounded-lg border border-[var(--color-border)] bg-white">
                  {found.data.data.map(c => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                      <span className="min-w-0 text-sm">{c.name} <span className="text-[var(--color-text-secondary)]">· {c.code}{c.documentId ? ` · ${c.documentId}` : ''}</span></span>
                      <button type="button" className={BUTTON} disabled={busy || c.id === account.customerId} onClick={() => { if (account.state === 'PENDING') actions.approve(account.id, c.id); else actions.link(account.id, c.id); setSearch('') }}>{account.state === 'PENDING' ? 'Aprobar con este cliente' : c.id === account.customerId ? 'Ya vinculado' : 'Vincular'}</button>
                    </li>
                  ))}
                </ul>
              )}
              {account.customer && account.state !== 'PENDING' && <button type="button" className={`${BUTTON} mt-2`} disabled={busy} onClick={() => actions.link(account.id, null)}>Quitar vínculo con {account.customer.name}</button>}
            </div>
          )}

          {canManage && (isActive || account.state === 'SUSPENDED') && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--color-divider)] pt-3">
              {isActive && <button type="button" className={DANGER} disabled={busy} onClick={() => { setMode('suspend'); setReason('') }}>Suspender cuenta</button>}
              {account.state === 'SUSPENDED' && <button type="button" className={BUTTON} disabled={busy} onClick={() => actions.reactivate(account.id)}>Reactivar cuenta</button>}
            </div>
          )}

          {mode && (
            <form className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3" onSubmit={e => { e.preventDefault(); if (!reasonOk) return; if (mode === 'suspend') actions.suspend(account.id, reason.trim()); else actions.reject(account.id, reason.trim()); setMode(null); setReason('') }}>
              <label className="block text-sm font-medium" htmlFor={`reason-${account.id}`}>{mode === 'suspend' ? 'Motivo de la suspensión' : 'Motivo del rechazo'} (entre 3 y 300 letras)</label>
              <textarea id={`reason-${account.id}`} required minLength={3} maxLength={300} className={FIELD} value={reason} onChange={e => setReason(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className={mode === 'suspend' ? DANGER : PRIMARY} disabled={busy || !reasonOk}>{mode === 'suspend' ? 'Suspender cuenta' : 'Rechazar cuenta'}</button>
                <button type="button" className={BUTTON} onClick={() => { setMode(null); setReason('') }}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  )
}
