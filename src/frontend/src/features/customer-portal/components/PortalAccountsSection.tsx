import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAdminAccount, assignAccountAdvisor, assignAccountTier, fetchAdminAccounts, fetchAdminAdvisors, fetchAdminPriceMappings,
  fetchAdminTiers, linkAccountCustomer, reactivatePortalAccount, rejectAdminAccount, suspendPortalAccount,
} from '../../../services/customer-portal.service'
import { useHasAssignedAction } from '../../users/access'
import AdminAccountRow, { STATE_LABELS, type AccountActions } from './AdminAccountRow'

const FIELD = 'mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm'
const CARD = 'rounded-xl border border-[var(--color-border)] bg-white p-5'
const FILTERS: Array<[string, string]> = [['', 'Todas'], ['PENDING', 'Pendientes'], ['ACTIVE', 'Activas'], ['SUSPENDED', 'Suspendidas'], ['REJECTED', 'Rechazadas']]
export const NO_ADVISOR = 'NO_ADVISOR'

/**
 * Portal account requests, shown as the «Solicitudes» tab of Comercial (no tab bar of its own).
 * What each person sees depends on the panels assigned to them; the server checks every action again.
 * «Sin asesor» is a filter, offered only to people who can assign advisors.
 */
export default function PortalAccountsSection({ initialFilter = '' }: { initialFilter?: string }) {
  const canRead = useHasAssignedAction(['portalAccounts:read'])
  const canAssign = useHasAssignedAction(['portalAccounts:assign'])
  const canManage = useHasAssignedAction(['portalAccounts:manage'])
  // The general tariff name is read with the same action that manages tariffs (Super Admin always).
  const canTariffs = useHasAssignedAction(['portalTariffs:manage'])
  const client = useQueryClient()
  const tiers = useQuery({ queryKey: ['portal-admin-tiers'], enabled: canManage, queryFn: fetchAdminTiers })
  const accounts = useQuery({ queryKey: ['portal-admin-accounts'], enabled: canRead, queryFn: fetchAdminAccounts })
  const advisors = useQuery({ queryKey: ['portal-admin-advisors'], enabled: canAssign, queryFn: fetchAdminAdvisors })
  const mappings = useQuery({ queryKey: ['portal-admin-mappings'], enabled: canTariffs, queryFn: fetchAdminPriceMappings })
  const [message, setMessage] = useState(''), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState(initialFilter), [search, setSearch] = useState('')

  const general = mappings.data?.find(m => m.type === 'FINAL_CUSTOMER')
  const generalName = general?.priceList?.isActive ? general.priceList.name : null

  async function run(fn: () => Promise<unknown>, success: string, failure = 'No se pudo guardar. Revisa los datos e inténtalo de nuevo.') {
    setBusy(true); setMessage(''); setFailed(false)
    try {
      await fn()
      await Promise.all(['portal-admin-tiers', 'portal-admin-accounts', 'portal-admin-mappings', 'portal-admin-advisors'].map(k => client.invalidateQueries({ queryKey: [k] })))
      setMessage(success)
    } catch (error) {
      const server = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message
      setMessage(typeof server === 'string' && server ? server : failure); setFailed(true)
    } finally { setBusy(false) }
  }

  const actions: AccountActions = {
    assignAdvisor: (id, advisorId) => void run(() => assignAccountAdvisor(id, advisorId), 'Asesor asignado.', 'No se pudo asignar el asesor. Inténtalo de nuevo.'),
    assignTier: (id, tierId) => void run(() => assignAccountTier(id, tierId), 'Tarifa guardada para este cliente.'),
    link: (id, customerId) => void run(() => linkAccountCustomer(id, customerId), customerId ? 'Cliente vinculado.' : 'Vínculo quitado.'),
    suspend: (id, reason) => void run(() => suspendPortalAccount(id, reason), 'Cuenta suspendida. Ya no puede ingresar.', 'No se pudo suspender la cuenta. Inténtalo de nuevo.'),
    reactivate: id => void run(() => reactivatePortalAccount(id), 'Cuenta reactivada.', 'No se pudo reactivar la cuenta. Inténtalo de nuevo.'),
    approve: (id, customerId) => void run(() => approveAdminAccount(id, customerId), 'Cuenta aprobada.', 'No se pudo aprobar la cuenta. Revisa que tenga asesor y que haya una tarifa general configurada.'),
    reject: (id, reason) => void run(() => rejectAdminAccount(id, reason), 'Cuenta rechazada.', 'No se pudo rechazar la cuenta.'),
  }

  const pending = (accounts.data ?? []).filter(a => a.state === 'PENDING').length
  const withoutAdvisor = (accounts.data ?? []).filter(a => !a.advisorId && a.state !== 'REJECTED').length
  // The «Sin asesor» filter exists only for people who can assign advisors; a stale value falls back to «Todas».
  const filters: Array<[string, string]> = canAssign ? [...FILTERS, [NO_ADVISOR, withoutAdvisor > 0 ? `Sin asesor (${withoutAdvisor})` : 'Sin asesor']] : FILTERS
  const effective = filters.some(([value]) => value === filter) ? filter : ''
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (accounts.data ?? []).filter(a => (!effective || (effective === NO_ADVISOR ? !a.advisorId && a.state !== 'REJECTED' : a.state === effective)) && (!term || [a.companyName, a.contactName, a.email, a.documentId ?? '', a.advisor?.name ?? '', a.city?.name ?? ''].some(v => v.toLowerCase().includes(term))))
  }, [accounts.data, effective, search])

  if (!canRead) return <p>No tienes asignadas las solicitudes del portal. Pídele a tu administrador que te las asigne.</p>
  const loadFailed = canManage && tiers.isError || accounts.isError || (canAssign && advisors.isError) || (canTariffs && mappings.isError)

  return (
    <div className="space-y-4">
      {message && <p role={failed ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${failed ? 'bg-[var(--color-error-bg-subtle)] text-[var(--color-error-hover)]' : 'bg-[var(--color-success-bg-subtle)] text-[var(--color-success-hover)]'}`}>{message}</p>}
      {loadFailed && <p role="alert" className="rounded-lg bg-[var(--color-error-bg-subtle)] p-3 text-sm text-[var(--color-error-hover)]">No se pudieron cargar todos los datos. <button type="button" className="min-h-11 font-medium underline" onClick={() => { void tiers.refetch(); void accounts.refetch(); void advisors.refetch(); void mappings.refetch() }}>Reintentar</button></p>}

      <section className={CARD} aria-labelledby="portal-requests-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="portal-requests-title" className="text-xl font-semibold">Solicitudes del portal{pending > 0 && <span className="ml-2 rounded-full bg-[var(--color-warning-bg-subtle)] px-2 py-0.5 align-middle text-xs text-[var(--color-warning-hover)]">{pending} por revisar</span>}{canAssign && withoutAdvisor > 0 && <span className="ml-2 rounded-full bg-[var(--color-warning-bg-subtle)] px-2 py-0.5 align-middle text-xs text-[var(--color-warning-hover)]">{withoutAdvisor} sin asesor</span>}</h2>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm"><span className="sr-only">Buscar cuenta</span><input type="search" className={`${FIELD} mt-0 w-56 max-w-full`} placeholder="Buscar por empresa, persona o ciudad" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="text-sm"><span className="sr-only">Filtrar por estado</span><select className={`${FIELD} mt-0 w-44 max-w-full`} value={effective} onChange={e => setFilter(e.target.value)}>{filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
        </div>
        {accounts.isPending ? (
          <div className="mt-4 space-y-3" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--color-bg-surface-hover)]" />)}</div>
        ) : !accounts.data?.length ? (
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Todavía no hay clientes registrados. Cuando alguien cree su cuenta en la tienda aparecerá aquí.</p>
        ) : !visible.length && effective === NO_ADVISOR && !search.trim() ? (
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">No hay cuentas esperando asesor. Las nuevas aparecerán aquí si ninguna zona cubre su ciudad.</p>
        ) : !visible.length ? (
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Ninguna cuenta coincide{effective ? ` con «${STATE_LABELS[effective] ?? 'Sin asesor'}»` : ''}. Cambia el filtro o la búsqueda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--color-divider)]">{visible.map(a => <AdminAccountRow key={a.id} account={a} tiers={tiers.data ?? []} advisors={advisors.data ?? []} generalListName={generalName} busy={busy} canAssign={canAssign} canManage={canManage} actions={actions} />)}</ul>
        )}
      </section>
    </div>
  )
}
