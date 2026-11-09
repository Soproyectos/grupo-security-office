import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CheckboxField } from '../../../components/ui/Checkbox'
import {
  fetchUserAccess,
  applyUserPackage,
  removeUserPackage,
  setUserAccessGrants,
  type AccessPackage,
  type AccessGrant,
  type AccessActionDefinition,
  type AccessSelection,
  userAccessErrorMessage,
  ACCESS_CATALOG_VERSION,
} from '../../../services/users.service'

/** Agrupa los paquetes por dominio para la UI. */
const PACKAGE_GROUPS: { id: string; label: string; packageIds: string[] }[] = [
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    packageIds: [
      'biblioteca-consulta',
      'biblioteca-fichas',
      'biblioteca-precios',
      'biblioteca-publicacion',
      'biblioteca-importaciones',
      'biblioteca-maestros',
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    packageIds: [
      'vendedor',
      'supervisor-comercial',
      'jefe-de-equipo',
      'gestion-comercial',
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing y mercadeo',
    packageIds: [
      'marketing-consulta',
      'marketing-edicion',
      'marketing-publicacion',
    ],
  },
  {
    id: 'legacy',
    label: 'Paquetes anteriores (solo retiro)',
    packageIds: [
      'biblioteca-actualizacion',
      'gestion-listas-precios',
      'biblioteca-productos',
      'publicacion-catalogo',
    ],
  },
]

interface PackageWithMeta extends AccessPackage {
  selections: AccessSelection[]
  assignable: boolean
}

interface ActionWithMeta extends AccessActionDefinition {
  selected: boolean
  granted: boolean
  sourceIds: string[]
}

function getPackageMeta(packages: AccessPackage[]): PackageWithMeta[] {
  return packages.map((pkg) => ({
    ...pkg,
    assignable: pkg.assignable ?? true,
  }))
}

function getActionMeta(
  actions: AccessActionDefinition[] | undefined,
  grants: AccessGrant[],
): ActionWithMeta[] {
  if (!actions) return []
  return actions.map((action) => {
    const grantEntries = grants.filter((g) => g.actionId === action.id)
    return {
      ...action,
      selected: false,
      granted: grantEntries.length > 0,
      sourceIds: grantEntries.map((g) => g.sourceId),
    }
  })
}

/**
 * Determina el estado de un paquete según las concesiones actuales:
 * - 'all': todas sus selecciones están concedidas (por cualquier fuente)
 * - 'partial': al menos una selección concedida
 * - 'none': ninguna selección concedida
 */
function getPackageState(
  pkg: PackageWithMeta,
  grants: AccessGrant[],
): { state: 'all' | 'partial' | 'none'; count: number } {
  const total = pkg.selections.length
  if (total === 0) return { state: 'none', count: 0 }

  let count = 0
  for (const sel of pkg.selections) {
    if (grants.some((g) => g.actionId === sel.actionId && g.scope === sel.scope)) {
      count++
    }
  }
  if (count === 0) return { state: 'none', count: 0 }
  if (count === total) return { state: 'all', count }
  return { state: 'partial', count }
}

/** Verifica si una acción individual está concedida (por cualquier fuente). */
function isActionGranted(actionId: string, scope: string, grants: AccessGrant[]): boolean {
  return grants.some((g) => g.actionId === actionId && g.scope === scope)
}

interface UserAccessManagerProps {
  userId: string
  userName: string
  userEmail: string
  onClose?: () => void
}

export default function UserAccessManager({ userId, userName, userEmail, onClose }: UserAccessManagerProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['biblioteca', 'comercial']))
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set())
  const [draftGrants, setDraftGrants] = useState<AccessSelection[] | null>(null)
  const [reason, setReason] = useState('')
  const [savingPackageId, setSavingPackageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Obtener estado de acceso del usuario seleccionado
  const { data: accessState, isLoading: accessLoading, refetch: refetchAccess } = useQuery({
    queryKey: ['users', userId, 'access'],
    queryFn: () => fetchUserAccess(userId),
    enabled: !!userId,
  })

  const packagesMeta = useMemo(
    () => (accessState ? getPackageMeta(accessState.packages) : []),
    [accessState],
  )

  const actionsMeta = useMemo(
    () => (accessState ? getActionMeta(accessState.actions, accessState.grants) : []),
    [accessState],
  )

  const grants = accessState?.grants ?? []
  const accessVersion = accessState?.accessVersion ?? 0

  // Mutación para aplicar paquete
  const applyPackageMutation = useMutation({
    mutationFn: async ({ packageId }: { packageId: string }) => {
      setSavingPackageId(packageId)
      setError(null)
      return applyUserPackage(userId, packageId, accessVersion, {
        catalogVersion: ACCESS_CATALOG_VERSION,
        reason: reason.trim() || undefined,
      })
    },
    onSuccess: () => {
      refetchAccess()
      setSavingPackageId(null)
      setReason('')
    },
    onError: (err) => {
      setSavingPackageId(null)
      setError(userAccessErrorMessage(err, 'No se pudo aplicar el paquete'))
    },
  })

  // Mutación para retirar paquete
  const removePackageMutation = useMutation({
    mutationFn: async ({ packageId }: { packageId: string }) => {
      setSavingPackageId(packageId)
      setError(null)
      return removeUserPackage(userId, packageId, accessVersion)
    },
    onSuccess: () => {
      refetchAccess()
      setSavingPackageId(null)
      setReason('')
    },
    onError: (err) => {
      setSavingPackageId(null)
      setError(userAccessErrorMessage(err, 'No se pudo retirar el paquete'))
    },
  })

  // Mutación para guardar selección manual (casilla a casilla)
  const saveGrantsMutation = useMutation({
    mutationFn: async (grantsToSave: AccessSelection[]) => {
      setError(null)
      return setUserAccessGrants(userId, grantsToSave, accessVersion, {
        catalogVersion: ACCESS_CATALOG_VERSION,
        reason: reason.trim() || undefined,
      })
    },
    onSuccess: () => {
      refetchAccess()
      setDraftGrants(null)
      setReason('')
    },
    onError: (err) => {
      setError(userAccessErrorMessage(err, 'No se pudieron guardar los accesos'))
    },
  })

  const hasDraft = draftGrants !== null
  const isAnyPending =
    applyPackageMutation.isPending ||
    removePackageMutation.isPending ||
    saveGrantsMutation.isPending

  // Helpers para el estado de la UI
  const togglePackage = useCallback(
    (pkg: PackageWithMeta) => {
      const { state } = getPackageState(pkg, grants)
      if (state === 'all') {
        // Retirar paquete completo
        removePackageMutation.mutate({ packageId: pkg.id })
      } else {
        // Aplicar paquete completo
        applyPackageMutation.mutate({ packageId: pkg.id })
      }
    },
    [grants, applyPackageMutation, removePackageMutation],
  )

  const toggleAction = useCallback(
    (actionId: string, scope: AccessSelection['scope'], pkgId: string) => {
      setDraftGrants((current) => {
        const base = current ?? grants.map((g) => ({ actionId: g.actionId, scope: g.scope }))
        const next = new Set(base.map((s) => `${s.actionId}|${s.scope}`))
        const key = `${actionId}|${scope}`
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return Array.from(next).map((k): AccessSelection => {
          const parts = k.split('|')
          const aid = parts[0]
          const sc = parts[1]
          return { actionId: aid ?? '', scope: (sc as AccessSelection['scope']) ?? 'global' }
        })
      })
      // Asegurar que el paquete esté expandido al tocar una acción
      setExpandedPackages((prev) => new Set(prev).add(pkgId))
    },
    [grants],
  )

  const isActionSelected = useCallback(
    (actionId: string, scope: AccessSelection['scope']) => {
      if (draftGrants) {
        return draftGrants.some((s) => s.actionId === actionId && s.scope === scope)
      }
      return isActionGranted(actionId, scope, grants)
    },
    [draftGrants, grants],
  )

  const getPackageSelectionCount = useCallback(
    (pkg: PackageWithMeta) => {
      const source = draftGrants ?? grants
      return pkg.selections.filter((sel) =>
        source.some((s) => s.actionId === sel.actionId && s.scope === sel.scope),
      ).length
    },
    [draftGrants, grants],
  )

  const hasChanges = hasDraft

  if (accessLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] min-h-[500px] flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-security-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-security-700">
                {userName?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{userName}</h3>
              <p className="text-sm text-gray-500">{userEmail}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Cargando accesos…
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] flex-col gap-4">
      {/* Header del usuario seleccionado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-security-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-bold text-security-700">
              {userName?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{userName}</h3>
            <p className="text-sm text-gray-500">{userEmail}</p>
          </div>
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-security-100 text-security-700 rounded">
            v{accessVersion}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-security-600 hover:text-security-800 font-medium"
            >
              Cerrar
            </button>
          )}
          {hasChanges && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Motivo (auditoría)</span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej.: necesita acceso a precios para revisión mensual"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-security-500/30"
                />
              </label>
              <button
                onClick={() => saveGrantsMutation.mutate(draftGrants!)}
                disabled={saveGrantsMutation.isPending}
                className="px-4 py-2 bg-security-500 text-white rounded-lg font-semibold hover:bg-security-600 disabled:opacity-50"
              >
                {saveGrantsMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => {
                  setDraftGrants(null)
                  setReason('')
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Descartar
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Contenido principal: grupos de paquetes */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {PACKAGE_GROUPS.map((group) => {
          const groupPackages = packagesMeta.filter((pkg) => group.packageIds.includes(pkg.id))
          if (groupPackages.length === 0) return null

          const isGroupOpen = expandedGroups.has(group.id)

          return (
            <div key={group.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups((prev) => {
                    const next = new Set(prev)
                    if (next.has(group.id)) next.delete(group.id)
                    else next.add(group.id)
                    return next
                  })
                }
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                aria-expanded={isGroupOpen}
              >
                <span className="text-gray-400 shrink-0">
                  {isGroupOpen ? '▾' : '▸'}
                </span>
                <span className="font-semibold text-gray-900">{group.label}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {groupPackages.filter((p) => getPackageState(p, grants).state !== 'none').length} de{' '}
                  {groupPackages.length} aplicados
                </span>
              </button>

              {isGroupOpen && (
                <div className="divide-y divide-gray-100 px-4">
                  {groupPackages.map((pkg) => {
                    const { state } = getPackageState(pkg, grants)
                    const selectionCount = getPackageSelectionCount(pkg)
                    const total = pkg.selections.length
                    const isPkgOpen = expandedPackages.has(pkg.id)
                    const isLegacy = !pkg.assignable
                    const isSaving = savingPackageId === pkg.id

                    return (
                      <div key={pkg.id} className="py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPackages((prev) => {
                                const next = new Set(prev)
                                if (next.has(pkg.id)) next.delete(pkg.id)
                                else next.add(pkg.id)
                                return next
                              })
                            }
                            className="shrink-0 text-gray-400 hover:text-gray-700"
                            aria-expanded={isPkgOpen}
                            aria-label={isPkgOpen ? `Contraer ${pkg.name}` : `Desplegar ${pkg.name}`}
                          >
                            {isPkgOpen ? '▾' : '▸'}
                          </button>

                          <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                            <CheckboxField
                              checked={state === 'all' || selectionCount === total}
                              indeterminate={state === 'partial' || (selectionCount > 0 && selectionCount < total)}
                              onChange={() => togglePackage(pkg)}
                              disabled={isLegacy || isSaving || isAnyPending}
                              className="h-4 w-4 rounded border-gray-300 text-security-600 focus:ring-security-500"
                            />
                            <div className="min-w-0">
                              <span className="font-medium text-gray-900 truncate block">{pkg.name}</span>
                              <span className="text-xs text-gray-500 truncate block">
                                {isLegacy ? 'Paquete anterior — solo se puede retirar' : `${selectionCount} de ${total} accesos`}
                              </span>
                            </div>
                          </label>

                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded ${
                              state === 'all'
                                ? 'bg-emerald-100 text-emerald-700'
                                : state === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {state === 'all' ? 'Completo' : state === 'partial' ? 'Parcial' : 'Sin accesos'}
                          </span>

                          {!isLegacy && (
                            <button
                              type="button"
                              onClick={() => togglePackage(pkg)}
                              disabled={isSaving || isAnyPending}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                state === 'all'
                                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                  : 'bg-security-50 text-security-600 hover:bg-security-100'
                              }`}
                            >
                              {isSaving ? 'Guardando…' : state === 'all' ? 'Retirar' : 'Aplicar'}
                            </button>
                          )}
                        </div>

                        {isPkgOpen && total > 0 && (
                          <ul className="mt-2 ml-10 pl-3 border-l border-gray-200 space-y-1.5">
                            {pkg.selections.map((sel) => {
                              const actionDef = actionsMeta.find((a) => a.id === sel.actionId)
                              const selected = isActionSelected(sel.actionId, sel.scope)
                              const granted = isActionGranted(sel.actionId, sel.scope, grants)

                              return (
                                <li key={`${sel.actionId}|${sel.scope}`}>
                                  <label className="flex cursor-pointer items-center gap-2.5 py-1.5">
                                    <CheckboxField
                                      checked={selected}
                                      onChange={() => toggleAction(sel.actionId, sel.scope, pkg.id)}
                                      disabled={isAnyPending}
                                      className="h-3.5 w-3.5 rounded border-gray-300 text-security-600 focus:ring-security-500"
                                    />
                                    <span className="text-sm text-gray-700">{actionDef?.label ?? sel.actionId}</span>
                                    <span className="ml-auto text-xs text-gray-400">
                                      {sel.scope === 'global'
                                        ? 'Global'
                                        : sel.scope === 'own'
                                        ? 'Mis datos'
                                        : sel.scope === 'team'
                                        ? 'Equipo'
                                        : 'Lista'}
                                    </span>
                                    {granted && !selected && (
                                      <span className="text-xs text-emerald-600 font-medium" title="Concedido por otra fuente">
                                        ✓ concedido
                                      </span>
                                    )}
                                  </label>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {saveGrantsMutation.isSuccess && !hasChanges && (
        <p className="text-sm text-emerald-600 text-center py-2">
          Accesos guardados. Se aplican en el próximo inicio de sesión del usuario.
        </p>
      )}
    </div>
  )
}