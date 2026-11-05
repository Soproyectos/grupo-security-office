import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserAccessServiceError, type UserAccessState } from '../../../services/users.service'
import { accessActionNotice, saveLibrarySelectionInCache, userAccessKey } from '../access'
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
  type LibraryTabDefinition,
} from '../library-permissions'

const BOX =
  'h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50'
const ROW =
  'flex min-h-11 items-center gap-3 rounded px-2 py-2 text-sm hover:bg-[var(--color-bg-surface-hover)] md:min-h-9 md:py-1'

function TabCheckbox({
  tab,
  state,
  disabled,
  onToggle,
}: {
  tab: LibraryTabDefinition
  state: 'all' | 'some' | 'none'
  disabled: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <label className={`${ROW} font-semibold text-[var(--color-text-primary)]`}>
      <input
        ref={ref}
        type="checkbox"
        className={BOX}
        checked={state === 'all'}
        disabled={disabled}
        aria-label={`${tab.label}: marcar o desmarcar todo`}
        onChange={onToggle}
      />
      <span>{tab.label}</span>
    </label>
  )
}

/**
 * Bloque único de Biblioteca en la pantalla de accesos: cinco secciones
 * (Productos, Fichas, Precios, Importaciones, Catálogos maestros) con una casilla por permiso. La casilla de cada
 * sección marca o desmarca todas las suyas; después se puede afinar. Un solo
 * botón guarda todo; el servidor valida y vuelve a calcular las dependencias.
 */
export function LibraryPermissionsBlock({ userId, access }: { userId: string; access: UserAccessState }) {
  const client = useQueryClient()
  const initial = initialSelection(access)
  const [draft, setDraft] = useState<Set<string>>(() => initialSelection(access))

  useEffect(() => {
    setDraft(initialSelection(access))
    // Se reinicia cuando el servidor devuelve otra versión de los accesos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.accessVersion])

  const mutation = useMutation({
    mutationFn: () =>
      saveLibrarySelectionInCache(client, userId, selectionToActionIds(draft), access.accessVersion, access.catalogVersion),
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
  const disabled = mutation.isPending

  return (
    <section aria-label="Biblioteca" className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div>
        <h3 className="text-lg font-condensed font-semibold text-[var(--color-text-primary)]">Biblioteca</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Marca lo que esta persona podrá hacer. La casilla de cada sección marca todo; después puedes quitar lo que no quieras.
          Al marcar algo se marca también lo que necesita.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {LIBRARY_TABS.map((tab) => (
          <fieldset key={tab.id} aria-label={tab.label} className="min-w-0 rounded border border-[var(--color-border)] p-2">
            <TabCheckbox
              tab={tab}
              state={tabState(draft, tab)}
              disabled={disabled}
              onToggle={() => setDraft((current) => toggleTab(current, tab))}
            />
            <p className="px-2 pb-1 text-xs text-[var(--color-text-secondary)]">{tab.hint}</p>
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
          </fieldset>
        ))}
      </div>

      <div role="status" aria-label="Resumen de Biblioteca" className="space-y-1 rounded bg-[var(--color-bg-surface)] p-3 text-sm text-[var(--color-text-primary)]">
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

      {blockedByPublication && (
        <p role="alert" className="text-sm text-[var(--color-warning)]">{PUBLICATION_NEEDS_EDIT_MESSAGE}</p>
      )}
      {notice && (
        <p role="alert" data-tone={notice.tone} className={`text-sm ${notice.tone === 'conflict' ? 'text-[var(--color-warning)]' : 'text-[var(--color-error)]'}`}>
          {notice.message}
        </p>
      )}
      {mutation.isSuccess && !dirty && <p role="status" className="text-sm text-[var(--color-success)]">Cambios guardados.</p>}

      <div className="flex flex-wrap items-center gap-2">
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
