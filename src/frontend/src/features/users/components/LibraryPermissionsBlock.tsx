import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserAccessServiceError, type UserAccessState } from '../../../services/users.service'
import { accessActionNotice, saveLibrarySelectionInCache, userAccessKey } from '../access'
import { PermissionGroup } from './AccessPermissionGrid'
import {
  actionDisplayName,
  checkAction,
  hasPublicationComplement,
  initialSelection,
  LIBRARY_SELECTION_ACTION_IDS,
  LIBRARY_TABS,
  PUBLICATION_NEEDS_EDIT_MESSAGE,
  sameSelection,
  selectionChanges,
  selectionToActionIds,
  tabState,
  toggleTab,
  uncheckAction,
  visibleTabs,
} from '../library-permissions'

const BOX =
  'h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50'
const ROW =
  'flex min-h-11 items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--color-bg-surface-hover)] md:min-h-7 md:py-0.5'

/**
 * Bloque único de Biblioteca en la pantalla de accesos: cinco secciones
 * (Productos, Fichas, Precios, Importaciones, Catálogos maestros) con una casilla por permiso. La casilla de cada
 * sección marca o desmarca todas las suyas; después se puede afinar. Un solo
 * botón guarda todo; el servidor valida y vuelve a calcular las dependencias.
 */
export function LibraryPermissionsBlock({ userId, access, embedded = false, onDirtyChange, extraPermissions, busy = false, onBusyChange, tree = false }: { userId: string; access: UserAccessState; embedded?: boolean; onDirtyChange?: (dirty: boolean) => void; extraPermissions?: ReactNode; busy?: boolean; onBusyChange?: (busy: boolean) => void; tree?: boolean }) {
  const client = useQueryClient()
  const initial = initialSelection(access)
  const initialKey = selectionToActionIds(initial).join('|')
  const [draft, setDraft] = useState<Set<string>>(() => initialSelection(access))

  useEffect(() => {
    setDraft(initialSelection(access))
    // Un guardado de otro panel no debe borrar el borrador de Biblioteca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  const mutation = useMutation({
    mutationFn: () =>
      saveLibrarySelectionInCache(client, userId, selectionToActionIds(draft), access.accessVersion, access.catalogVersion),
    onSuccess: () => {
      const latest = client.getQueryData<UserAccessState>(userAccessKey(userId))
      if (latest) setDraft(initialSelection(latest))
    },
    onError: (error) => {
      if (error instanceof UserAccessServiceError && error.code === 'conflict') {
        void client.invalidateQueries({ queryKey: userAccessKey(userId) })
      }
    },
  })

  const publication = hasPublicationComplement(access)
  const blockedByPublication = publication && !draft.has('products:write')
  const dirty = !sameSelection(initial, draft)
  const changes = selectionChanges(initial, draft)
  const shownTabs = visibleTabs(draft)
  const notice = accessActionNotice(mutation.error)
  const replacesPrevious = access.sources.some(
    (source) => source.templateId !== null && ['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios', 'biblioteca-actualizacion'].includes(source.templateId),
  ) || access.grants.some((grant) =>
    /^(products|prices|providers|listas|imports|masters):/.test(grant.actionId) &&
    access.sources.some((source) => source.id === grant.sourceId && (source.kind === 'manual' || (source.templateId !== null && ['gestion-listas-precios', 'biblioteca-productos', 'publicacion-catalogo'].includes(source.templateId)))),
  )
  const disabled = mutation.isPending || busy
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange?.(mutation.isPending) }, [mutation.isPending, onBusyChange])

  return (
    <section aria-label="Biblioteca" className={`${embedded ? 'space-y-2' : 'space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3'} ${tree ? 'access-library-block' : ''}`}>
      <div>
        {!embedded && <h3 className="text-lg font-condensed font-semibold text-[var(--color-text-primary)]">Biblioteca</h3>}
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Marca los accesos o selecciona toda una sección. Se incluyen los permisos necesarios.
        </p>
      </div>

      <div className={tree ? 'access-tree' : `grid items-start gap-2 sm:grid-cols-2 ${extraPermissions ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
        {LIBRARY_TABS.map((tab) => (
          <PermissionGroup key={tab.id}
              label={tab.label}
              state={tabState(draft, tab)}
              disabled={disabled}
              tree={tree}
              onToggle={() => setDraft((current) => toggleTab(current, tab))}
            >
            <p className="px-1.5 pb-1 text-xs text-[var(--color-text-secondary)]">{tab.hint}</p>
            <ul>
              {tab.items.map((item) => (
                <li key={item.actionId}>
                  <label className={`${ROW} text-[var(--color-text-primary)]`}>
                    <input
                      type="checkbox"
                      className={BOX}
                      checked={draft.has(item.actionId)}
                      disabled={disabled}
                      onChange={(event) =>
                        setDraft((current) => (event.target.checked ? checkAction(current, item.actionId) : uncheckAction(current, item.actionId)))
                      }
                    />
                    <span className="break-words">{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </PermissionGroup>
        ))}
        {extraPermissions}
      </div>

      <details className="rounded bg-[var(--color-bg-surface)] px-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-[var(--color-text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] md:min-h-8 md:py-1">Resumen: {draft.size} permisos · {shownTabs.length} pestañas{dirty ? ' · Sin guardar' : ''}</summary>
      <div role="status" aria-label="Resumen de Biblioteca" className="space-y-1 pb-2 text-[var(--color-text-primary)]">
        <p className="font-semibold">Así quedará</p>
        {draft.size === 0 ? (
          <p>Sin acceso a Biblioteca: no verá ninguna pestaña.</p>
        ) : shownTabs.length === 0 ? (
          <p className="text-[var(--color-warning)]">Con lo marcado todavía no se abre ninguna pestaña. Marca «Ver productos», «Editar fichas» o «Revisar archivo de precios».</p>
        ) : (
          <>
            <p>Verá las pestañas: {shownTabs.map((tab) => tab.label).join(', ')}.</p>
            <ul className="list-disc space-y-0.5 pl-5 text-[var(--color-text-secondary)]">
              {shownTabs.map((tab) => (
                <li key={tab.id}>
                  <strong className="font-semibold text-[var(--color-text-primary)]">{tab.label}:</strong>{' '}
                  {[...new Set(tab.items.filter((item) => draft.has(item.actionId)).map((item) => item.label))].join(', ')}
                </li>
              ))}
            </ul>
          </>
        )}
        {draft.size > 0 && LIBRARY_SELECTION_ACTION_IDS.some((id) => draft.has(id) && !shownTabs.some((tab) => tab.items.some((item) => item.actionId === id))) && (
          <p className="text-[var(--color-text-secondary)]">
            Otros permisos marcados: {LIBRARY_SELECTION_ACTION_IDS.filter((id) => draft.has(id) && !shownTabs.some((tab) => tab.items.some((item) => item.actionId === id))).map(actionDisplayName).join(', ')}.
          </p>
        )}
        {dirty && (changes.added.length > 0 || changes.removed.length > 0) && (
          <p className="text-[var(--color-text-secondary)]">
            {changes.added.length > 0 && <>Se agrega: {changes.added.map(actionDisplayName).join(', ')}. </>}
            {changes.removed.length > 0 && <>Se quita: {changes.removed.map(actionDisplayName).join(', ')}.</>}
          </p>
        )}
        {replacesPrevious && (
          <p className="text-[var(--color-text-secondary)]">Al guardar, esta selección reemplaza los paquetes y asignaciones anteriores de Biblioteca. Los accesos comerciales no cambian.</p>
        )}
      </div>
      </details>

      {blockedByPublication && (
        <p role="alert" className="text-sm text-[var(--color-warning)]">{PUBLICATION_NEEDS_EDIT_MESSAGE}</p>
      )}
      {notice && (
        <p role="alert" data-tone={notice.tone} className={`text-sm ${notice.tone === 'conflict' ? 'text-[var(--color-warning)]' : 'text-[var(--color-error)]'}`}>
          {notice.message}
        </p>
      )}
      {mutation.isSuccess && !dirty && <p role="status" className="text-sm text-[var(--color-success)]">Cambios guardados.</p>}

      <div className={`flex flex-wrap items-center gap-2 ${tree ? 'access-library-actions' : ''}`}>
        <button
          type="button"
          disabled={disabled || !dirty || blockedByPublication}
          onClick={() => mutation.mutate()}
          className="min-h-11 rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9"
        >
          {disabled ? 'Guardando…' : 'Guardar Biblioteca'}
        </button>
        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() => {
            mutation.reset()
            setDraft(initialSelection(access))
          }}
          className="min-h-11 rounded border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9"
        >
          Descartar cambios
        </button>
      </div>
    </section>
  )
}
