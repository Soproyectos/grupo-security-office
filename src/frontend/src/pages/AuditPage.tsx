import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { canViewAudit } from '../lib/rbac'
import { SearchFilterBar, type SearchFilterChip } from '../components/filters/SearchFilterBar'
import {
  describeAuditEntry,
  type AuditEntryView,
  type AuditChangeRow,
} from '../features/audit/audit-format'

// Type for the raw audit log from backend
interface AuditLogRaw {
  id: string
  userId: string | null
  action: string
  entity: string
  entityId: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  createdAt: string
  actorName?: string | null
  user?: { name?: string | null } | null
}

const TONE_DOT: Record<AuditEntryView['tone'], string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
}

const TONE_BG: Record<AuditEntryView['tone'], string> = {
  success: 'bg-emerald-50 border-emerald-100',
  error: 'bg-red-50 border-red-100',
  warning: 'bg-amber-50 border-amber-100',
  info: 'bg-sky-50 border-sky-100',
}

const TONE_TEXT: Record<AuditEntryView['tone'], string> = {
  success: 'text-emerald-700',
  error: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-sky-700',
}

const TONE_TITLE: Record<AuditEntryView['tone'], string> = {
  success: 'Éxito',
  error: 'Error',
  warning: 'Advertencia',
  info: 'Información',
}

function ChangeLine({ change }: { change: AuditChangeRow }) {
  return (
    <li className="text-sm text-neutral-700">
      <span className="font-medium text-neutral-800">{change.label}:</span>{' '}
      {change.kind === 'changed' && (
        <>
          <span className="text-neutral-500">{change.before}</span>
          <span aria-hidden="true"> → </span>
          <span className="sr-only"> cambió a </span>
          <span className="font-medium">{change.after}</span>
        </>
      )}
      {change.kind === 'set' && <span className="font-medium">{change.after}</span>}
      {change.kind === 'removed' && (
        <span className="text-neutral-500 line-through">{change.before} (se quitó)</span>
      )}
    </li>
  )
}

function AuditEntry({ log }: { log: AuditEntryView }) {
  return (
    <li className={`${TONE_BG[log.tone]} border-l-4 border-r border-t border-b divide-y divide-neutral-100 first:rounded-t-lg last:rounded-b-lg`}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            role="img"
            aria-label={TONE_TITLE[log.tone]}
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${TONE_DOT[log.tone]}`}
          />
          <p className="text-base text-neutral-900">
            <span className="font-semibold text-neutral-900">{log.actor}</span>{' '}
            <span className={TONE_TEXT[log.tone]} font-medium>{log.verb}</span>
          </p>
          <span className={`ml-auto text-sm ${TONE_TEXT[log.tone]} font-medium`}>
            {log.entityLabel}
          </span>
          <span className="text-sm text-neutral-400">· {log.when}</span>
        </div>
        {log.changes.length > 0 && (
          <ul className="mt-3 ml-1 pl-3 border-l-2 border-neutral-200 space-y-1" aria-label="Cambios realizados">
            {log.changes.map((change, idx) => (
              <ChangeLine key={`${change.key}-${change.kind}-${idx}`} change={change} />
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

const ENTITY_OPTIONS = [
  { value: '', label: 'Todas las entidades' },
  { value: 'Product', label: 'Productos' },
  { value: 'Category', label: 'Categorías' },
  { value: 'Brand', label: 'Marcas' },
  { value: 'User', label: 'Usuarios' },
  { value: 'Price', label: 'Precios' },
] as const

const ACTION_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'CREATE', label: 'Crear' },
  { value: 'UPDATE', label: 'Actualizar' },
  { value: 'DELETE', label: 'Eliminar' },
] as const

export default function AuditPage() {
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['audit', entity, action, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_SIZE))
      params.set('skip', String((page - 1) * PAGE_SIZE))
      if (entity) params.set('entity', entity)
      if (action) params.set('action', action)
      const res = await api.get(`/audit?${params}`)
      // Backend may return { data: [...] } or [...] directly
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
    },
  })

  const auditFilterCount = (entity !== '' ? 1 : 0) + (action !== '' ? 1 : 0)
  const auditFilterChips: SearchFilterChip[] = []
  if (entity !== '') {
    const entityOpt = ENTITY_OPTIONS.find((e) => e.value === entity)
    auditFilterChips.push({
      id: `entity-${entity}`,
      label: `Entidad: ${entityOpt?.label ?? entity}`,
      onRemove: () => { setEntity(''); setPage(1); },
    })
  }
  if (action !== '') {
    const actionOpt = ACTION_OPTIONS.find((a) => a.value === action)
    auditFilterChips.push({
      id: `action-${action}`,
      label: `Acción: ${actionOpt?.label ?? action}`,
      onRemove: () => { setAction(''); setPage(1); },
    })
  }

  const clearAuditFilters = () => {
    setEntity('')
    setAction('')
    setPage(1)
  }

  if (!canViewAudit()) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <svg aria-hidden="true" className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-gray-500 font-medium">No tienes permisos para ver esta sección</p>
      </div>
    )
  }

  const entries: (AuditEntryView & { id: string })[] = (logs ?? []).map((log: AuditLogRaw) => ({
    ...describeAuditEntry(log),
    id: log.id,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-security-700">Auditoría global</h1>
        <p className="text-sm text-gray-500 mt-1">Historial completo de cambios en toda la plataforma</p>
      </div>

      <SearchFilterBar
        activeFilterCount={auditFilterCount}
        activeFilterChips={auditFilterChips}
        onClearFilters={clearAuditFilters}
        clearFiltersDisabled={auditFilterCount === 0}
        layout="sidebar"
        sidebarSections={[
          {
            id: 'entities',
            label: 'Entidad',
            content: (
              <fieldset>
                <legend className="text-sm font-medium text-neutral-800 mb-2">Filtrar por entidad</legend>
                <div className="space-y-2">
                  {ENTITY_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                      <input
                        type="radio"
                        name="audit-entity"
                        checked={entity === opt.value}
                        onChange={() => setEntity(opt.value)}
                        className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ),
          },
          {
            id: 'actions',
            label: 'Acción',
            content: (
              <fieldset>
                <legend className="text-sm font-medium text-neutral-800 mb-2">Filtrar por acción</legend>
                <div className="space-y-2">
                  {ACTION_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                      <input
                        type="radio"
                        name="audit-action"
                        checked={action === opt.value}
                        onChange={() => setAction(opt.value)}
                        className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ),
          },
        ]}
        content={
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="py-12 text-center" role="status" aria-label="Cargando auditoría">
                <svg aria-hidden="true" className="animate-spin h-8 w-8 text-security-600 mx-auto mb-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-gray-500">Cargando auditoría...</p>
              </div>
            ) : error ? (
              <div className="py-12 text-center" role="alert">
                <svg aria-hidden="true" className="w-8 h-8 text-red-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-gray-500">Error al cargar la auditoría</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center">
                <svg aria-hidden="true" className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500">No hay registros de auditoría</p>
                {auditFilterCount > 0 && (
                  <button
                    onClick={clearAuditFilters}
                    className="mt-3 text-sm text-security-600 hover:text-security-700 underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                <ol className="divide-y divide-gray-100" aria-label="Historial de cambios del sistema">
                  {entries.map((entry) => (
                    <AuditEntry key={entry.id} log={entry} />
                  ))}
                </ol>
                {entries.length === PAGE_SIZE && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={isLoading}
                      className="w-full text-sm text-security-600 hover:text-security-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cargar más registros
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        }
      />
    </div>
  )
}