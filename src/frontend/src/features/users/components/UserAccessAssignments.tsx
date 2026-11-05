import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth.store'
import { LibraryPermissionsBlock } from './LibraryPermissionsBlock'
import {
  fetchUserAccess,
  fetchUsers,
  removeManualAccessSource,
  UserAccessServiceError,
  type AccessPackage,
  type AccessSelection,
  type UserAccessState,
  setUserAccessGrants,
} from '../../../services/users.service'
import {
  accessActionNotice,
  actionLabel,
  applyPackageInCache,
  canAdministerAccess,
  revokePackageInCache,
  refreshSessionAfterAccessChange,
  scopeLabel,
  userAccessKey,
} from '../access'

/**
 * COM-01 frontend — panel de asignación de paquetes de acceso por usuario.
 *
 * COMPONENTE NUEVO sobre la base propia de esta copia (writePath declarado de
 * la ficha; no es una copia del worktree L — `UserAccessAssignments` no existía
 * ni en S3 ni aquí, ver COM-01 §2.4). Consume la API auditada de COM-01
 * backend (GET/PUT/DELETE `/users/:id/access`) sin añadir reglas en el
 * navegador: pinta `selections` del servidor (acción + alcance concretos,
 * ficha regla 1) y ecoa `expectedVersion`/`expectedCatalogVersion` para que
 * el OCC y el catálogo sigan siendo autoridad en servidor.
 *
 * Sin migración masiva: paquetes y concesiones individuales se administran
 * explícitamente, usuario por usuario.
 */

function sourceLine(access: UserAccessState | undefined, pkg: AccessPackage): string | null {
  if (!pkg.applied || !pkg.sourceId) return null
  const source = access?.sources.find((item) => item.id === pkg.sourceId)
  if (!source) return null
  const kind = source.kind === 'template' ? 'paquete' : 'manual'
  return source.reason ? `Fuente: ${kind} (${source.reason})` : `Fuente: ${kind}`
}

/** Paquetes por bloque; los anteriores se conservan para poder retirarlos. */
const PACKAGE_PANELS = [
  { label: 'Comercial', ids: ['vendedor', 'jefe-de-equipo', 'supervisor-comercial', 'gestion-comercial'] },
  { label: 'Biblioteca', ids: ['biblioteca-publicacion'] },
  { label: 'Marketing y mercadeo', ids: ['marketing-consulta', 'marketing-edicion', 'marketing-publicacion'] },
  { label: 'Accesos anteriores', ids: ['gestion-listas-precios', 'biblioteca-productos', 'publicacion-catalogo'] },
] as const

const ACTION_TREE = [
  {
    panel: 'Comercial',
    children: [
      { label: 'Vendedor', ids: ['customers:read', 'customers:create', 'customers:edit', 'quotes:read', 'quotes:create', 'quotes:edit', 'quotes:discount', 'quotes:status', 'activities:read', 'activities:create', 'activities:complete', 'targets:read', 'commercialPromotions:read'] },
      { label: 'Supervisor comercial', ids: ['teamInsights:read', 'activities:assign'] },
      { label: 'Gestión comercial', ids: ['customers:reassign', 'targets:edit', 'commercialPromotions:create', 'commercialPromotions:edit', 'commercialPromotions:publish', 'commercialPromotions:withdraw'] },
      { label: 'Otras acciones', ids: ['users:read'] },
    ],
  },
  {
    panel: 'Biblioteca',
    children: [
      { label: 'Estadísticas en Mi resumen', ids: ['libraryStats:products', 'libraryStats:update', 'libraryStats:publication'] },
    ],
  },
] as const

/** Fuentes vigentes que pueden dar «editar fichas» al complemento «Publicar en tienda». */
const EDIT_SHEETS_SOURCE_IDS = new Set(['biblioteca-seleccion', 'biblioteca-fichas', 'biblioteca-actualizacion'])
/** Antes «Actualización» (fichas + precios juntos): ya no se asigna, solo se retira. */
const PREVIOUS_UPDATE_PACKAGE_ID = 'biblioteca-actualizacion'
const COMPLEMENT_PACKAGE_ID = 'biblioteca-publicacion'
const LEGACY_PACKAGE_IDS = new Set(['gestion-listas-precios', 'biblioteca-productos', 'publicacion-catalogo'])

export function UserAccessPanel({ user }: { user: { id: string; name?: string } }) {
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
  const librarySources = (access?.sources ?? []).flatMap((source) => {
    const sourceGrants = (access?.grants ?? []).filter((grant) => grant.sourceId === source.id)
    const libraryGrants = sourceGrants.filter((grant) => /^(products|prices|providers|listas|imports|masters):/.test(grant.actionId))
    if (!libraryGrants.length) return []
    const sourcePackage = access?.packages.find((pkg) => pkg.sourceId === source.id)
    const packageName = sourcePackage?.name
    const tabNames = [
      ...(libraryGrants.some((grant) => grant.actionId === 'products:read' && grant.scope === 'global') ? ['Productos'] : []),
      ...(libraryGrants.some((grant) => grant.actionId === 'products:write' && grant.scope === 'global') ? ['Fichas'] : []),
      ...(libraryGrants.some((grant) => grant.actionId === 'prices:preview' && grant.scope === 'global') ? ['Precios'] : []),
      ...(libraryGrants.some((grant) => grant.actionId === 'imports:read' && grant.scope === 'global') ? ['Importaciones'] : []),
      ...(libraryGrants.some((grant) => grant.actionId === 'masters:read' && grant.scope === 'global') ? ['Catálogos maestros'] : []),
      ...(libraryGrants.some((grant) => grant.actionId === 'products:publish' && grant.scope === 'global') ? ['Publicar en tienda'] : []),
    ]
    const extraLibraryActions = [...new Set(libraryGrants
      .filter((grant) => !(['products:read', 'products:write', 'prices:preview', 'products:publish', 'imports:read', 'masters:read'].includes(grant.actionId) && grant.scope === 'global'))
      .map((grant) => `${actionLabel(grant.actionId)} (${scopeLabel(grant.scope)})`))]
    const otherActions = [...new Set(sourceGrants
      .filter((grant) => !/^(products|prices|providers|listas|imports|masters):/.test(grant.actionId))
      .map((grant) => actionLabel(grant.actionId)))]
    return [{
      source,
      title: source.kind === 'manual' ? 'Otra asignación previa' : packageName ?? 'Paquete anterior',
      previous: source.templateId !== PREVIOUS_UPDATE_PACKAGE_ID && (
        source.kind === 'manual' || LEGACY_PACKAGE_IDS.has(source.templateId ?? '') || sourcePackage?.assignable === false
      ),
      tabNames,
      extraLibraryActions,
      otherActions,
    }]
  })
  const knownActionIds = new Set<string>(ACTION_TREE.flatMap((panel) => panel.children.flatMap((child) => child.ids)))
  const editableActionIds = new Set((access?.actions ?? []).filter((action) => action.enabled && knownActionIds.has(action.id)).map((action) => action.id))
  const legacyManualGrants = manualGrants.filter((grant) => !editableActionIds.has(grant.actionId))
  const [draft, setDraft] = useState<AccessSelection[]>([])

  useEffect(() => {
    setDraft(manualGrants.filter((grant) => editableActionIds.has(grant.actionId)).map(({ actionId, scope, resourceId: id }) => ({ actionId, scope, ...(id ? { resourceId: id } : {}) })))
  // Reset the editor when the server returns a new version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access?.accessVersion])

  const saveGrantsMutation = useMutation({
    mutationFn: async () => {
      const receipt = await setUserAccessGrants(user.id, draft, expectedVersion, { catalogVersion: access?.catalogVersion })
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

  const applyMutation = useMutation({
    mutationFn: (packageId: string) =>
      applyPackageInCache(client, user.id, packageId, expectedVersion, access?.catalogVersion),
    onError: (error) => {
      // 409: la versión cambió bajo los pies; el refetch trae la vigente.
      if (error instanceof UserAccessServiceError && error.code === 'conflict') void query.refetch()
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (packageId: string) => revokePackageInCache(client, user.id, packageId, expectedVersion),
    onError: (error) => {
      if (error instanceof UserAccessServiceError && error.code === 'conflict') void query.refetch()
    },
  })

  const loadNotice = accessActionNotice(query.error)
  const busy = applyMutation.isPending || revokeMutation.isPending || saveGrantsMutation.isPending || removeManualMutation.isPending
  const actionNotice = accessActionNotice(applyMutation.error ?? revokeMutation.error ?? saveGrantsMutation.error ?? removeManualMutation.error ?? null)

  const toggleAction = (actionId: string, checked: boolean) => {
    const definition = access?.actions?.find((action) => action.id === actionId)
    const scope = definition?.allowedScopes[0]
    if (!definition?.enabled || !scope) return
    setDraft((items) => checked
      ? items.some((item) => item.actionId === actionId) ? items : [...items, { actionId, scope }]
      : items.filter((item) => item.actionId !== actionId))
  }

  const updateGrant = (actionId: string, update: Partial<AccessSelection>) => {
    setDraft((items) => items.map((item) => {
      if (item.actionId !== actionId) return item
      const next = { ...item, ...update }
      if (next.scope !== 'list' && next.scope !== 'product') delete next.resourceId
      return next
    }))
  }

  return (
    <section aria-label="Paquetes de acceso" className="mt-6 space-y-4">
      <h2 className="text-lg font-condensed font-semibold text-[var(--color-text-primary)]">
        Acceso de {user.name ?? user.id}
      </h2>

      {access && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Versión de concesiones: {access.accessVersion} · Catálogo: {access.catalogVersion}
        </p>
      )}

      {query.isPending && !access && (
        <p className="text-sm text-[var(--color-text-tertiary)]">Cargando concesiones…</p>
      )}

      {loadNotice && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {loadNotice.message}
        </p>
      )}

      {actionNotice && (
        <p
          role="alert"
          data-tone={actionNotice.tone}
          className={`text-sm ${actionNotice.tone === 'conflict' ? 'text-[var(--color-warning)]' : 'text-[var(--color-error)]'}`}
        >
          {actionNotice.message}
        </p>
      )}

      {access && (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Acciones individuales</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">Marca las acciones comerciales y las estadísticas de Biblioteca en Mi resumen, y define su alcance. El acceso a las pestañas de Biblioteca se asigna en el bloque Biblioteca. El servidor valida alcances y dependencias.</p>
          {legacyManualGrants.length > 0 && <p role="status" className="text-sm text-[var(--color-warning)]">Hay concesiones manuales anteriores fuera de este editor. Retira explícitamente la asignación manual antes de guardar para conservar su alcance y evitar reenviar permisos antiguos.</p>}
          <div className="space-y-3">
            {ACTION_TREE.map((panel) => (
              <fieldset key={panel.panel} className="rounded border border-[var(--color-border)] p-3">
                <legend className="px-1 font-semibold">{panel.panel}</legend>
                <div className="space-y-3">
                  {panel.children.map((child) => {
                    const definitions = child.ids.flatMap((id) => {
                      const definition = access.actions?.find((action) => action.id === id)
                      return definition?.enabled ? [definition] : []
                    })
                    if (!definitions.length) return null
                    return <fieldset key={child.label} className="rounded bg-[var(--color-bg-primary)] p-3"><legend className="px-1 text-sm font-semibold">{child.label}</legend><ul className="space-y-3">{definitions.map((definition) => {
                      const grant = draft.find((item) => item.actionId === definition.id)
                      return <li key={definition.id} className="space-y-1 border-b border-[var(--color-border)] pb-2 last:border-0">
                        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(grant)} onChange={(event) => toggleAction(definition.id, event.target.checked)} /><span><strong>{definition.label}</strong> <span className="font-mono text-xs">{definition.id}</span><span className="block text-xs text-[var(--color-text-secondary)]">{definition.purpose}{definition.dependencies.length ? ` Requiere: ${definition.dependencies.join(', ')}.` : ''}</span></span></label>
                        {grant && <div className="ml-6 flex flex-wrap items-end gap-2"><label className="text-xs">Alcance<select aria-label={`Alcance ${definition.id}`} value={grant.scope} onChange={(event) => updateGrant(definition.id, { scope: event.target.value as AccessSelection['scope'] })} className="mt-1 block rounded border p-1.5 text-[var(--color-text-primary)] bg-[var(--color-bg-card)]">{definition.allowedScopes.map((scope) => <option key={scope} value={scope}>{scopeLabel(scope)}</option>)}</select></label>{(grant.scope === 'list' || grant.scope === 'product') && <label className="text-xs">{grant.scope === 'list' ? 'Identificador de lista' : 'Identificador de producto'}<input aria-label={`Recurso ${definition.id}`} value={grant.resourceId ?? ''} onChange={(event) => updateGrant(definition.id, { resourceId: event.target.value })} className="mt-1 block rounded border p-1.5 text-[var(--color-text-primary)] bg-[var(--color-bg-card)]" /></label>}</div>}
                      </li>
                    })}</ul></fieldset>
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <button type="button" disabled={busy || legacyManualGrants.length > 0 || !access.actions?.length || draft.length === 0 || draft.some((item) => ((item.scope === 'list' || item.scope === 'product') && !item.resourceId?.trim()))} onClick={() => saveGrantsMutation.mutate()} className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm text-white disabled:opacity-50">Guardar acciones individuales</button>
          {access.sources.filter((source) => source.kind === 'manual' && !librarySources.some((item) => item.source.id === source.id)).map((source) => (
            <button key={source.id} type="button" disabled={busy} onClick={() => removeManualMutation.mutate(source.id)} className="ml-2 rounded border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-error)] disabled:opacity-50">Retirar asignación manual</button>
          ))}
        </div>
      )}

      {access && (
        <div className="space-y-4" aria-label="Paquetes por panel">
          {PACKAGE_PANELS.map((panel) => {
            const packages = panel.ids.flatMap((id) => access.packages.filter((pkg) =>
              pkg.id === id && (!LEGACY_PACKAGE_IDS.has(pkg.id) && pkg.assignable !== false || pkg.applied),
            ))
            const panelLibrarySources = panel.label === 'Biblioteca' ? librarySources.filter((item) => item.previous) : []
            if (panel.label === 'Biblioteca') {
              const complement = packages.find((item) => item.id === COMPLEMENT_PACKAGE_ID)
              // Editar fichas llega de la selección de Biblioteca o de un paquete de Fichas vigente.
              const canEditSheets = access.grants.some((grant) => grant.actionId === 'products:write' && grant.scope === 'global' &&
                access.sources.some((source) => source.id === grant.sourceId && EDIT_SHEETS_SOURCE_IDS.has(source.templateId ?? '')))
              return <div key={panel.label} className="space-y-3">
                <LibraryPermissionsBlock userId={user.id} access={access} />
                {panelLibrarySources.length > 0 && <section aria-label="Accesos anteriores de Biblioteca" className="space-y-3">
                  {panelLibrarySources.map((item) => <div key={item.source.id} className="rounded border border-[var(--color-warning)] p-3 text-sm">
                    <p className="font-semibold">{item.title} mantiene acceso a Biblioteca</p>
                    <p className="mt-1">Pestañas disponibles: {item.tabNames.length ? item.tabNames.join(', ') : 'ninguna pestaña directa'}.</p>
                    {item.extraLibraryActions.length > 0 && <p className="mt-1">También incluye: {item.extraLibraryActions.join(', ')}.</p>}
                    {item.otherActions.length > 0 && <p className="mt-1">Esta asignación también contiene accesos de otros paneles ({item.otherActions.join(', ')}), que se conservan al guardar Biblioteca.</p>}
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Al guardar Biblioteca, la selección sustituye estos accesos anteriores sin quitar los permisos comerciales.</p>
                  </div>)}
                </section>}
                {complement && <section aria-label="Complemento de Fichas" className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
                  <p className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--color-text-primary)]"><span>{complement.name} <span className="text-xs font-normal text-[var(--color-text-secondary)]">(complemento de Fichas)</span></span><span className="text-xs font-normal">{complement.applied ? 'Aplicado' : 'Sin aplicar'}</span></p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Permite publicar, programar y despublicar desde la ficha. Solo se puede asignar a quien ya puede editar fichas.</p>
                  {sourceLine(access, complement) && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{sourceLine(access, complement)}</p>}
                  <label className="mt-2 flex min-h-11 items-center gap-3 text-sm font-medium md:min-h-9"><input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={complement.applied} disabled={busy || (!complement.applied && !canEditSheets)} onChange={() => complement.applied ? revokeMutation.mutate(complement.id) : applyMutation.mutate(complement.id)} />{complement.applied ? 'Paquete asignado' : 'Asignar paquete'}</label>
                  {!canEditSheets && !complement.applied && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Marca y guarda primero «Editar fichas» en el bloque Biblioteca.</p>}
                </section>}
              </div>
            }
            if (packages.length === 0) return null
            return <section key={panel.label} aria-label={panel.label} className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
              <h3 className="text-lg font-condensed font-semibold text-[var(--color-text-primary)]">{panel.label}</h3>
              {packages.map((pkg) => {
                const legacy = LEGACY_PACKAGE_IDS.has(pkg.id) || pkg.assignable === false
                const fuente = sourceLine(access, pkg)
                const managedInLibrary = legacy && librarySources.some((item) => item.source.id === pkg.sourceId)
                return <details key={pkg.id} className="rounded border border-[var(--color-border)] p-3" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-[var(--color-text-primary)]"><span>{legacy ? 'Acceso anterior' : pkg.name}</span><span className="text-xs font-normal">{pkg.applied ? 'Aplicado' : 'Sin aplicar'}</span></summary>
                  {!legacy && fuente && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{fuente}</p>}
                  {!legacy && <ul className="mt-2 space-y-1">{pkg.selections.map((selection) => <li key={`${selection.actionId}|${selection.scope}|${selection.resourceId ?? ''}`} className="text-sm text-[var(--color-text-secondary)]"><span>{actionLabel(selection.actionId)}</span> <span className="font-mono text-xs">({selection.actionId})</span> — alcance {scopeLabel(selection.scope)}{selection.resourceId ? ` · recurso ${selection.resourceId}` : ''}</li>)}</ul>}
                  {!managedInLibrary && <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={pkg.applied} disabled={busy || (legacy && !pkg.applied)} onChange={() => pkg.applied ? revokeMutation.mutate(pkg.id) : applyMutation.mutate(pkg.id)} />{legacy ? 'Retirar acceso anterior' : pkg.applied ? 'Paquete asignado' : 'Asignar paquete'}</label>}
                  {managedInLibrary && <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Esta fuente se reemplaza al guardar el bloque Biblioteca, que muestra el detalle de lo que mantiene.</p>}
                </details>
              })}
            </section>
          })}
        </div>
      )}
    </section>
  )
}

export default function UserAccessAssignments() {
  const [params] = useSearchParams()
  const selectedId = params.get('usuario')
  const [search, setSearch] = useState('')
  const roles = useAuthStore((state) => state.user?.roles)
  const canAdminister = canAdministerAccess(roles)

  const { data: users } = useQuery({
    queryKey: ['users', 'access-selector', search],
    queryFn: () => fetchUsers(search),
    enabled: canAdminister,
    staleTime: 30_000,
  })

  const selected = (users ?? []).find((item) => item.id === selectedId)

  return (
    <div>
      <h1 className="text-xl font-condensed font-semibold text-[var(--color-text-primary)]">
        Asignación de paquetes de acceso
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1">
        Un paquete es una preselección de acciones concretas, no un rol: revisa cada acción y su
        alcance antes de aplicarlo. Cada usuario se administra por separado; no hay migración
        automática de cuentas existentes.
      </p>

      {!canAdminister && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
          Sólo Super Admin puede administrar concesiones por acción.
        </p>
      )}

      {canAdminister && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="access-user-search">
            Buscar usuario
          </label>
          <input
            id="access-user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuario"
            className="mt-1 w-full max-w-md px-3 py-2 rounded-lg text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
          />
          <ul className="mt-3 divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg max-w-md">
            {(users ?? []).map((item) => (
              <li key={item.id}>
                <Link
                  to={`/users/access?usuario=${encodeURIComponent(item.id)}`}
                  className={`block px-3 py-2 text-sm hover:bg-[var(--color-bg-primary)] ${
                    item.id === selectedId ? 'bg-[var(--color-primary-bg-subtle)]' : ''
                  }`}
                >
                  {item.name}
                  <span className="block text-xs text-[var(--color-text-tertiary)]">{item.email}</span>
                </Link>
              </li>
            ))}
            {(users ?? []).length === 0 && (
              <li className="px-3 py-2 text-sm text-[var(--color-text-tertiary)]">
                No hay usuarios que coincidan.
              </li>
            )}
          </ul>
        </div>
      )}

      {selectedId && <UserAccessPanel user={{ id: selectedId, name: selected?.name }} />}
    </div>
  )
}
