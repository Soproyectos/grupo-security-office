import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth.store'
import { LibraryPermissionsBlock } from './LibraryPermissionsBlock'
import { AccessPermissionGrid } from './AccessPermissionGrid'
import {
  fetchUserAccess,
  fetchUser,
  fetchUsersPage,
  removeManualAccessSource,
  UserAccessServiceError,
  type AccessSelection,
  type UserListItem,
  setUserAccessGrants,
} from '../../../services/users.service'
import {
  accessActionNotice,
  canAdministerAccess,
  hasAssignedAction,
  panelAccess,
  refreshSessionAfterAccessChange,
  scopeLabel,
  userAccessKey,
} from '../access'
import './UserAccessWorkspace.css'
import { visibleMarketingPages } from '../../marketing/marketing-access'

/**
 * COM-01 frontend — «Asignar paneles»: el Super Admin marca, acción por acción,
 * lo que cada persona puede hacer en cada panel.
 *
 * Consume la API auditada de COM-01 backend (GET/PUT `/users/:id/access`)
 * sin añadir reglas en el navegador: pinta las acciones del catálogo con su
 * alcance concreto y ecoa `expectedVersion`/`expectedCatalogVersion` para que
 * el OCC y el catálogo sigan siendo autoridad en servidor. No hay grupos de
 * accesos ni asignación automática por rol: todo se marca casilla a casilla.
 */

/** Panels shown in «Asignar paneles», in display order. */
const PANELS = ['Comercial', 'Biblioteca', 'Marketing y mercadeo'] as const

const ACTION_TREE = [
  { panel: 'Comercial', children: [
    { label: 'Clientes', ids: ['customers:read', 'customers:create', 'customers:edit', 'customers:reassign'] },
    { label: 'Cotizaciones', ids: ['quotes:read', 'quotes:create', 'quotes:edit', 'quotes:discount', 'quotes:status'] },
    { label: 'Agenda', ids: ['activities:read', 'activities:create', 'activities:complete', 'activities:assign'] },
    { label: 'Equipo y metas', ids: ['teamInsights:read', 'targets:read', 'targets:edit', 'users:read'] },
    // Portal groups feed the «Solicitudes» and «Zonas» tabs of Comercial; each is assigned on its own.
    { label: 'Solicitudes del portal', ids: ['portalAccounts:read', 'portalAccounts:manage', 'portalAccounts:assign'] },
    { label: 'Zonas', ids: ['portalZones:manage'] },
    { label: 'Auditoría', ids: ['audit:read'] },
    { label: 'Pedidos', ids: ['salesOrders:read', 'salesOrders:invoice'] },
    { label: 'Tienda web', ids: ['storefront:manage'] },
    { label: 'Tarifa general y niveles', ids: ['portalTariffs:manage'] },
  ] },
  { panel: 'Marketing y mercadeo', children: [
    { label: 'Contenido', ids: ['marketing:read', 'marketing:create', 'marketing:edit', 'marketing:delete'] },
    { label: 'Publicación', ids: ['marketing:publish'] },
    // Feed the «Promociones internas» and «Gestionar avisos» tabs of Marketing (they used to live in Comercial).
    { label: 'Avisos internos', ids: ['commercialPromotions:read', 'commercialPromotions:create', 'commercialPromotions:edit', 'commercialPromotions:publish', 'commercialPromotions:withdraw'] },
  ] },
  { panel: 'Biblioteca', children: [
    // Complement of the Fichas tab: needs «Editar fichas», assigned in the Biblioteca tabs.
    { label: 'Publicar en tienda', ids: ['products:publish'] },
    { label: 'Estadísticas en Mi resumen', ids: ['libraryStats:products', 'libraryStats:update', 'libraryStats:publication'] },
  ] },
] as const

/** Plain-language help under the portal groups of Comercial; «Ver cuentas del portal» is a prerequisite of the tabs. */
const GROUP_HINTS: Readonly<Record<string, string>> = {
  'Solicitudes del portal': 'Ver y gestionar las cuentas que se registran en la tienda. Asignar asesor permite repartir las que aún no tienen uno. Cuánto ve cada persona depende del alcance.',
  Zonas: 'Administrar las zonas que reparten los registros nuevos entre asesores. Incluye ver las cuentas del portal.',
  Auditoría: 'Ver el registro de quién cambió qué en las áreas comerciales. El historial de Biblioteca solo se ve además con «Editar fichas» y las notas internas.',
  Pedidos: 'Ver los pedidos que salen de las cotizaciones ganadas. «Registrar factura» permite anotar el número y la fecha de la factura. Cuánto ve cada persona depende del alcance.',
  'Tienda web': 'Ver el resumen de la tienda web, cambiar sus ajustes y atender las cuentas y consultas de los clientes.',
  'Tarifa general y niveles': 'Elegir la tarifa general de la tienda y crear o editar los niveles de clientes. Incluye ver las cuentas del portal.',
  'Publicar en tienda': 'Permite publicar, programar y retirar productos desde la ficha. Necesita «Editar fichas» ya guardado en la pestaña Fichas.',
  'Avisos internos': 'Consultar los avisos vigentes abre la pestaña Promociones internas. Crear avisos abre Gestionar avisos, donde también se editan, publican y retiran.',
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
const SUMMARY = `min-h-11 cursor-pointer rounded-lg px-3 py-2 md:min-h-9 hover:bg-[var(--color-bg-surface-hover)] ${FOCUS}`

function AccessSection({ title, summary, children, workspace = false }: { title: string; summary: string; children: ReactNode; workspace?: boolean }) {
  if (workspace) return <section aria-label={title === 'Biblioteca' ? 'Panel Biblioteca' : title} className="access-section"><header className="access-section-heading"><h3>{title}</h3><span>{summary}</span></header><div className="access-section-body">{children}</div></section>
  return (
    <section aria-label={title === 'Biblioteca' ? 'Panel Biblioteca' : title} className={workspace ? 'access-section' : undefined}>
    <details open={workspace} className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] ${workspace ? 'access-tree-group' : ''}`}>
      <summary className={SUMMARY}>
        <span className="ml-2 font-condensed text-base font-semibold">{title}</span>
        <span className="ml-3 text-xs text-[var(--color-text-secondary)]">{summary}</span>
      </summary>
      <div className={`border-t border-[var(--color-border)] p-3 ${workspace ? 'access-tree-content' : ''}`}>{children}</div>
    </details>
    </section>
  )
}

export function UserAccessPanel({ user, roles = [], onDirtyChange, workspace = false, activePanel = 'Comercial' }: { user: { id: string; name?: string }; roles?: string[]; onDirtyChange?: (dirty: boolean) => void; workspace?: boolean; activePanel?: string }) {
  const [workspacePanel, setWorkspacePanel] = useState(activePanel)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: userAccessKey(user.id),
    queryFn: () => fetchUserAccess(user.id),
    retry: false,
  })
  const access = query.data
  const expectedVersion = access?.accessVersion ?? 0
  const manualSourceIds = new Set(access?.sources.filter((source) => source.kind === 'manual').map((source) => source.id) ?? [])
  const manualGrants = (access?.grants ?? []).filter((grant) => manualSourceIds.has(grant.sourceId))
  const knownActionIds = new Set<string>(ACTION_TREE.flatMap((panel) => panel.children.flatMap((child) => child.ids)))
  const editableActionIds = new Set((access?.actions ?? []).filter((action) => action.enabled && knownActionIds.has(action.id)).map((action) => action.id))
  const legacyManualGrants = manualGrants.filter((grant) => !editableActionIds.has(grant.actionId))
  const initialGrants = manualGrants.filter((grant) => editableActionIds.has(grant.actionId)).map(({ actionId, scope, resourceId }) => ({ actionId, scope, ...(resourceId ? { resourceId } : {}) }))
  const [draft, setDraft] = useState<AccessSelection[]>(() => initialGrants)
  const [libraryDirty, setLibraryDirty] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const selectionKey = (items: AccessSelection[]) => JSON.stringify(items.map((item) => [item.actionId, item.scope, item.resourceId ?? '']).sort())
  const manualDirty = Boolean(access) && selectionKey(draft) !== selectionKey(initialGrants)
  const initialManualKey = selectionKey(initialGrants)
  useEffect(() => { onDirtyChange?.(manualDirty || libraryDirty) }, [manualDirty, libraryDirty, onDirtyChange])

  useEffect(() => {
    setDraft(manualGrants.filter((grant) => editableActionIds.has(grant.actionId)).map(({ actionId, scope, resourceId: id }) => ({ actionId, scope, ...(id ? { resourceId: id } : {}) })))
  // Conservar el borrador si otro panel se guarda sin cambiar estas acciones.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialManualKey])

  const saveGrantsMutation = useMutation({
    mutationFn: async () => {
      const receipt = draft.length === 0 && manualSourceIds.size === 1
        ? await removeManualAccessSource(user.id, [...manualSourceIds][0]!, expectedVersion)
        : await setUserAccessGrants(user.id, draft, expectedVersion, { catalogVersion: access?.catalogVersion })
      await refreshSessionAfterAccessChange(client, user.id)
      return receipt
    },
    onError: (error) => {
      if (error instanceof UserAccessServiceError && error.code === 'conflict') void query.refetch()
    },
  })

  const removeManualMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const receipt = await removeManualAccessSource(user.id, sourceId, expectedVersion)
      await refreshSessionAfterAccessChange(client, user.id)
      return receipt
    },
    onError: (error) => {
      if (error instanceof UserAccessServiceError && error.code === 'conflict') void query.refetch()
    },
  })

  const loadNotice = accessActionNotice(query.error)
  const busy = libraryBusy || saveGrantsMutation.isPending || removeManualMutation.isPending
  const actionNotice = accessActionNotice(saveGrantsMutation.error ?? removeManualMutation.error ?? null)

  const toggleAction = (actionId: string, checked: boolean) => {
    const definition = access?.actions?.find((action) => action.id === actionId)
    const scope = definition?.allowedScopes[0]
    if (!definition?.enabled || !scope) return
    setDraft((items) => {
      if (checked) {
        const next = [...items]
        const visited = new Set<string>()
        const add = (id: string, preferredScope: AccessSelection['scope']) => {
          if (visited.has(id) || inherited.has(id) || !editableActionIds.has(id)) return
          visited.add(id)
          const action = access?.actions?.find((item) => item.id === id)
          const selectedScope = action?.allowedScopes.includes(preferredScope) ? preferredScope : action?.allowedScopes[0]
          if (!action || !selectedScope) return
          if (!next.some((item) => item.actionId === id)) next.push({ actionId: id, scope: selectedScope })
          action.dependencies.forEach((dependency) => add(dependency, selectedScope))
        }
        add(actionId, scope)
        return next
      }
      const removed = new Set([actionId])
      let changed = true
      while (changed) {
        changed = false
        for (const item of items) {
          const action = access?.actions?.find((definition) => definition.id === item.actionId)
          if (!removed.has(item.actionId) && action?.dependencies.some((dependency) => removed.has(dependency) && !inherited.has(dependency))) {
            removed.add(item.actionId)
            changed = true
          }
        }
      }
      return items.filter((item) => !removed.has(item.actionId))
    })
  }

  const updateGrant = (actionId: string, update: Partial<AccessSelection>) => {
    setDraft((items) => items.map((item) => {
      if (item.actionId !== actionId) return item
      const next = { ...item, ...update }
      if (next.scope !== 'list' && next.scope !== 'product') delete next.resourceId
      return next
    }))
  }

  const inherited = new Set((access?.grants ?? []).filter((grant) => !manualSourceIds.has(grant.sourceId)).map((grant) => grant.actionId))
  const ambiguousManual = manualSourceIds.size > 1
  const renderActions = (panelLabel: string, embedded = false) => {
    const tree = ACTION_TREE.find((panel) => panel.panel === panelLabel)
    if (!access || !tree) return null
    const groups = tree.children.map((group) => ({ label: group.label, hint: GROUP_HINTS[group.label] ?? (panelLabel === 'Biblioteca' ? 'Se guarda con acciones individuales.' : undefined), actions: group.ids.flatMap((id) => {
      const definition = access.actions?.find((action) => action.id === id)
      return definition?.enabled ? [definition] : []
    }) }))
    if (!groups.some((group) => group.actions.length)) return null
    const locked = busy || ambiguousManual || legacyManualGrants.length > 0
    return <AccessPermissionGrid groups={groups} embedded={embedded} tree={workspace} selected={new Set(draft.map((grant) => grant.actionId))} inherited={inherited} disabled={locked}
      onToggle={toggleAction} onToggleGroup={(ids, checked) => ids.forEach((id) => toggleAction(id, checked))}
      inheritedLabel={(actionId) => {
        const grant = access.grants.find((item) => item.actionId === actionId && !manualSourceIds.has(item.sourceId))
        return grant?.sourceId === 'derived:team-hierarchy' ? 'por personas a cargo' : grant ? 'por asignación anterior' : undefined
      }}
      renderOptions={(actionId, included) => {
        const grant = draft.find((item) => item.actionId === actionId)
        const definition = access.actions?.find((action) => action.id === actionId)
        if (!grant && included) return <p className="ml-6 text-xs text-[var(--color-text-secondary)]">{[...new Set(access.grants.filter((item) => item.actionId === actionId && !manualSourceIds.has(item.sourceId)).map((item) => `${scopeLabel(item.scope)}${item.resourceId ? ` · ${item.resourceId}` : ''}`))].join(' · ')}</p>
        if (!grant || !definition) return null
        return <div className="mb-1 ml-6 flex min-w-0 flex-wrap items-center gap-1 text-xs">
          <label className="min-w-0">Alcance<select aria-label={`Alcance ${actionId}`} value={grant.scope} disabled={locked} onChange={(event) => updateGrant(actionId, { scope: event.target.value as AccessSelection['scope'] })} className={`ml-1 min-h-11 max-w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1 text-xs md:min-h-7 ${FOCUS}`}>{definition.allowedScopes.map((scope) => <option key={scope} value={scope}>{scopeLabel(scope)}</option>)}</select></label>
          {(grant.scope === 'list' || grant.scope === 'product') && <label className="min-w-0">{grant.scope === 'list' ? 'Identificador de lista' : 'Identificador de producto'}<input aria-label={`Recurso ${actionId}`} value={grant.resourceId ?? ''} disabled={locked} onChange={(event) => updateGrant(actionId, { resourceId: event.target.value })} className={`block min-h-11 w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1 md:min-h-7 ${FOCUS}`} /></label>}
          {included && <button type="button" disabled={locked} onClick={() => toggleAction(actionId, false)} className={`min-h-11 text-[var(--color-error)] underline md:min-h-7 ${FOCUS}`}>Quitar asignación adicional</button>}
        </div>
      }} />
  }

  const individualActions = access && <div aria-label="Acciones individuales" className="space-y-2 border-t border-[var(--color-border)] pt-2">
    {legacyManualGrants.length > 0 && <p role="status" className="text-sm text-[var(--color-warning)]">Esta persona tiene accesos antiguos que este editor no muestra. Retira la asignación manual anterior para poder cambiar sus casillas.</p>}
    {ambiguousManual && <p role="alert" className="text-sm text-[var(--color-error)]">Esta persona tiene varias asignaciones manuales antiguas. Retira las anteriores para poder guardar una nueva selección.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || !manualDirty || ambiguousManual || legacyManualGrants.length > 0 || !access.actions?.length || (draft.length === 0 && manualSourceIds.size === 0) || draft.some((item) => ((item.scope === 'list' || item.scope === 'product') && !item.resourceId?.trim()))} onClick={() => saveGrantsMutation.mutate()} className={`min-h-11 rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 md:min-h-8 ${FOCUS}`}>{saveGrantsMutation.isPending ? 'Guardando…' : 'Guardar acciones individuales'}</button>
      <button type="button" disabled={busy || !manualDirty} onClick={() => { setDraft(initialGrants); saveGrantsMutation.reset() }} className={`min-h-11 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-surface-hover)] disabled:opacity-50 md:min-h-8 ${FOCUS}`}>Descartar acciones</button>
      <span className="text-xs text-[var(--color-text-secondary)]">Comercial, Marketing y Mi resumen se guardan juntos. Biblioteca tiene su propio botón.</span>
    </div>
    {saveGrantsMutation.isSuccess && !manualDirty && <p role="status" className="text-sm text-[var(--color-success-hover)]">Acciones guardadas.</p>}
    {access.sources.some((source) => source.kind === 'manual') && <details className="text-xs text-[var(--color-text-secondary)]"><summary className={`min-h-11 cursor-pointer py-1 md:min-h-7 ${FOCUS}`}>Asignaciones manuales anteriores</summary><div className="flex flex-wrap gap-2">{access.sources.filter((source) => source.kind === 'manual').map((source, index) => <button key={source.id} type="button" disabled={busy} onClick={() => removeManualMutation.mutate(source.id)} className={`min-h-11 rounded border border-[var(--color-border)] px-2 text-[var(--color-error)] hover:bg-[var(--color-error-bg-subtle)] disabled:opacity-50 md:min-h-8 ${FOCUS}`}>Retirar asignación manual{ambiguousManual ? ` ${index + 1}` : ''}</button>)}</div></details>}
  </div>

  return (
    <section aria-label="Accesos de la persona" className={`flex min-w-0 flex-col gap-3 ${workspace ? 'access-workspace-detail' : ''}`}>
      {!workspace && <h2 className="text-lg font-condensed font-semibold text-[var(--color-text-primary)]">
        Acceso de {user.name ?? user.id}
      </h2>}

      <p className="text-sm text-[var(--color-text-secondary)]">Marca lo que esta persona puede hacer; se incluyen sus requisitos. Cada casilla se puede marcar y desmarcar.</p>

      {query.isPending && !access && (
        <div role="status" aria-label="Cargando accesos" className="space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-lg bg-[var(--color-bg-surface)] motion-safe:animate-pulse" />)}
          <span className="sr-only">Cargando accesos…</span>
        </div>
      )}

      {loadNotice && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {loadNotice.message}
        </p>
      )}
      {query.isError && <button type="button" onClick={() => void query.refetch()} className={`min-h-11 self-start text-sm underline ${FOCUS}`}>Volver a cargar accesos</button>}
      {busy && <p role="status" className="text-sm text-[var(--color-text-secondary)]">Guardando accesos…</p>}
      {(manualDirty || libraryDirty) && <p role="status" className="text-sm font-medium text-[var(--color-text-primary)]">Hay cambios sin guardar.</p>}

      {actionNotice && (
        <p
          role="alert"
          data-tone={actionNotice.tone}
          className={`text-sm ${actionNotice.tone === 'conflict' ? 'text-[var(--color-warning)]' : 'text-[var(--color-error)]'}`}
        >
          {actionNotice.message}
        </p>
      )}

      {access && <div className={workspace ? 'access-panel-layout' : 'contents'}>
        {workspace && <nav aria-label="Paneles de acceso" className="access-panel-nav">
          <p className="access-column-title">Paneles</p>
          {PANELS.map((panel) => {
            const actionIds: string[] = ACTION_TREE.find((item) => item.panel === panel)?.children.flatMap((group) => [...group.ids]) ?? []
            const known = new Set(actionIds)
            const directCount = new Set(access.grants.filter((grant) => known.has(grant.actionId) || panel === 'Biblioteca' && /^(products|prices|providers|listas|imports|masters):/.test(grant.actionId)).map((grant) => grant.actionId)).size
            if (panel !== 'Biblioteca' && !actionIds.some((id) => access.actions?.some((action) => action.id === id && action.enabled))) return null
            const roleAdmin = roles.includes('Super Admin')
            const enabledActionIds = actionIds.filter((id) => access.actions?.some((action) => action.id === id && action.enabled))
            const accessInput = { roles, grants: access.grants, status: 'ready' as const }
            const hasAccess = panel === 'Biblioteca'
              ? panelAccess(accessInput, 'catalog').hasAnyPanel || hasAssignedAction(accessInput, enabledActionIds.filter((id) => id.startsWith('libraryStats:')))
              : panel === 'Marketing y mercadeo' ? visibleMarketingPages(accessInput).length > 0 : hasAssignedAction(accessInput, enabledActionIds)
            return <button key={panel} type="button" aria-pressed={workspacePanel === panel} onClick={() => setWorkspacePanel(panel)} className="access-panel-button">
              <span>{panel}</span>
              <span className="access-panel-summary">{roleAdmin ? 'Acceso administrativo por rol' : hasAccess ? `Disponible · ${directCount} acciones concedidas` : directCount ? 'Aún no abre ninguna pestaña · revisa las acciones' : 'Sin acceso asignado'}</span>
            </button>
          })}
          <p className="access-role-note">{roles.includes('Super Admin') ? 'Super Admin conserva acceso administrativo por su rol; las asignaciones listadas no representan ese acceso.' : `Roles de la persona: ${roles.length ? roles.join(', ') : 'sin roles registrados'}.`}</p>
        </nav>}
        <div className={workspace ? 'access-workspace-detail' : undefined}>
          {workspace && <header className="access-detail-heading"><h2>{user.name ?? user.id}</h2><span className="access-dirty-summary">{manualDirty || libraryDirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span></header>}
      {access && (
        <div className={`space-y-2 ${workspace ? 'access-sections' : ''}`} aria-label="Acciones por panel">
          {PANELS.map((panel) => {
            const panelView = workspace && workspacePanel !== panel ? 'access-panel-view access-panel-hidden' : 'access-panel-view'
            if (panel === 'Biblioteca') {
              const libraryCount = new Set(access.grants.filter((grant) => /^(products|prices|providers|listas|imports|masters):/.test(grant.actionId)).map((grant) => grant.actionId)).size
              return <div key={panel} className={panelView}><AccessSection title={panel} summary={`${libraryCount} acciones asignadas · Productos, fichas, precios e importaciones`} workspace={workspace}>
                <div className={workspace ? 'access-library-container' : 'space-y-3'}>
                <LibraryPermissionsBlock userId={user.id} access={access} embedded tree={workspace} onDirtyChange={setLibraryDirty} extraPermissions={renderActions(panel, true)} busy={busy} onBusyChange={setLibraryBusy} />
                </div>
              </AccessSection></div>
            }
            const panelActionIds = new Set<string>(ACTION_TREE.find((item) => item.panel === panel)?.children.flatMap((group) => [...group.ids]) ?? [])
            const hasActions = [...panelActionIds].some((id) => access.actions?.some((action) => action.id === id && action.enabled))
            if (!hasActions) return null
            const assignedCount = new Set(access.grants.filter((grant) => panelActionIds.has(grant.actionId)).map((grant) => grant.actionId)).size
            return <div key={panel} className={panelView}><AccessSection title={panel} summary={`${assignedCount} acciones asignadas`} workspace={workspace}>
              {renderActions(panel)}
            </AccessSection></div>
          })}
        </div>
      )}
      <div className={workspace ? 'access-manual-actions' : undefined}>{(!workspace || workspacePanel !== 'Biblioteca' || manualDirty) && individualActions}</div>
      {access && <details className="text-xs text-[var(--color-text-secondary)]"><summary className={`cursor-pointer py-2 ${FOCUS}`}>Información de la asignación</summary><p>Versión de concesiones: {access.accessVersion} · Catálogo: {access.catalogVersion}</p></details>}
        </div></div>}
    </section>
  )
}

export default function UserAccessAssignments() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('usuario')
  const [search, setSearch] = useState('')
  const [querySearch, setQuerySearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserListItem>()
  const [dirty, setDirty] = useState(false)
  const [pendingUser, setPendingUser] = useState<UserListItem>()
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const roles = useAuthStore((state) => state.user?.roles)
  const canAdminister = canAdministerAccess(roles)

  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const directory = useInfiniteQuery({
    queryKey: ['users', 'access-directory', querySearch],
    queryFn: ({ pageParam }) => fetchUsersPage(querySearch, 50, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.data.length, 0)
      return last.data.length && (last.meta ? loaded < last.meta.total : last.data.length === 50) ? loaded : undefined
    },
    enabled: canAdminister,
    staleTime: 30_000,
  })

  const users = directory.data?.pages.flatMap((page) => page.data) ?? []
  const identity = useQuery({
    queryKey: ['users', 'access-identity', selectedId],
    queryFn: () => fetchUser(selectedId!),
    enabled: canAdminister && Boolean(selectedId),
    staleTime: 30_000,
    retry: false,
  })
  const selected = identity.data ?? users.find((item) => item.id === selectedId) ?? (selectedUser?.id === selectedId ? selectedUser : undefined)
  useEffect(() => {
    if (selected) setSelectedUser(selected)
  }, [selected])

  return (
    <div className="access-workspace-page">
      <header className="access-workspace-heading">
      <h1 className="text-xl font-condensed font-semibold text-[var(--color-text-primary)]">
        Accesos de usuarios
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1">
        Selecciona una persona y elige qué puede hacer en cada panel.
      </p>
      </header>

      {!canAdminister && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
          Sólo Super Admin puede administrar concesiones por acción.
        </p>
      )}

      {canAdminister && (
        <div className="access-workspace-columns">
        <aside aria-label="Usuarios" className={`access-user-column min-w-0 ${userPickerOpen ? 'access-user-picker-open' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') { setUserPickerOpen(false); event.currentTarget.querySelector<HTMLButtonElement>('.access-mobile-user-button')?.focus() } }}>
          <button type="button" className={`access-mobile-user-button ${FOCUS}`} aria-expanded={userPickerOpen} onClick={() => setUserPickerOpen((open) => !open)}>Usuario: {selected?.name ?? 'Seleccionar usuario'}</button>
          <header>
          <h2 className="mb-1 font-condensed text-base font-semibold">Usuarios <span className="text-sm font-normal text-[var(--color-text-secondary)]">({directory.data?.pages[0]?.meta?.total ?? users.length})</span></h2>
          <label className="block text-xs font-medium text-[var(--color-text-primary)]" htmlFor="access-user-search">
            Buscar usuario
          </label>
          <input
            id="access-user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o correo"
            className={`mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] ${FOCUS}`}
          />
          </header>
          {directory.isPending && <div role="status" aria-label="Cargando usuarios" className="space-y-3 p-4">{[0, 1, 2].map((item) => <div key={item} className="h-12 rounded bg-[var(--color-bg-surface)] motion-safe:animate-pulse" />)}</div>}
          {directory.isError && <div role="alert" className="p-4 text-sm text-[var(--color-error)]">No se pudo cargar la lista de usuarios.<button type="button" onClick={() => void directory.refetch()} className={`mt-2 block min-h-11 underline ${FOCUS}`}>Reintentar carga</button></div>}
          <ul className="access-user-list divide-y divide-[var(--color-border)]">
            {users.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/users/access?usuario=${encodeURIComponent(item.id)}`}
                  aria-current={item.id === selectedId ? 'true' : undefined}
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
                    setUserPickerOpen(false)
                    if (dirty && item.id !== selectedId) {
                      event.preventDefault()
                      setPendingUser(item)
                    } else setSelectedUser(item)
                  }}
                  className={`block min-h-11 break-words px-2 py-1.5 text-sm hover:bg-[var(--color-bg-surface-hover)] ${FOCUS} ${
                    item.id === selectedId ? 'bg-[var(--color-primary-bg-subtle)]' : ''
                  }`}
                >
                  <span className={`font-medium ${item.id === selectedId ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>{item.name}</span>
                  <span className="block text-xs text-[var(--color-text-secondary)]">{item.email}</span>
                  <span className="block text-xs text-[var(--color-text-secondary)]">{item.id === selectedId ? 'Seleccionado' : item.isActive ? 'Activo' : 'Inactivo'}</span>
                </Link>
              </li>
            ))}
            {!directory.isPending && !directory.isError && users.length === 0 && (
              <li className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                {querySearch ? 'No hay usuarios que coincidan. Prueba con otro nombre o correo.' : 'No hay usuarios disponibles.'}
              </li>
            )}
          </ul>
          {directory.hasNextPage && <button type="button" disabled={directory.isFetchingNextPage} onClick={() => void directory.fetchNextPage()} className={`min-h-11 w-full border-t border-[var(--color-border)] p-3 text-sm hover:bg-[var(--color-bg-surface-hover)] disabled:opacity-50 ${FOCUS}`}>{directory.isFetchingNextPage ? 'Cargando usuarios…' : 'Cargar más usuarios'}</button>}
        </aside>
        <div className="min-w-0 flex min-h-0 flex-col overflow-hidden">
          {pendingUser && <div role="alert" className="mb-4 space-y-3 rounded-lg border border-[var(--color-border)] p-4 text-sm"><p>Hay cambios sin guardar. Puedes seguir editando o descartarlos para cambiar a {pendingUser.name}.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={() => setPendingUser(undefined)} className={`min-h-11 rounded border border-[var(--color-border)] px-3 hover:bg-[var(--color-bg-surface-hover)] ${FOCUS}`}>Seguir editando</button><button type="button" onClick={() => {
            setSelectedUser(pendingUser)
            setParams({ usuario: pendingUser.id })
            setPendingUser(undefined)
            setDirty(false)
          }} className={`min-h-11 rounded px-3 text-[var(--color-error)] hover:bg-[var(--color-error-bg-subtle)] ${FOCUS}`}>Descartar y cambiar de usuario</button></div></div>}
          {selectedId ? <UserAccessPanel key={selectedId} user={{ id: selectedId, name: selected?.name }} roles={selected?.roles?.map((role) => role.name) ?? []} workspace onDirtyChange={setDirty} /> : <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center"><h2 className="font-condensed text-lg font-semibold">Selecciona un usuario</h2><p className="mt-2 text-sm text-[var(--color-text-secondary)]">Elige a una persona de la lista para ver sus paneles y administrar sus accesos.</p></div>}
        </div>
        </div>
      )}

    </div>
  )
}
