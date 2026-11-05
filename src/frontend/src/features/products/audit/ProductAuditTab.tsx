import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Alert } from '../../../components/ui'
import { getApiErrorMessage } from '../../../lib/apiError'
import { useHasPermission } from '../../../lib/rbac'
import api from '../../../services/api'
import { fetchProductAudit, type AuditLog } from '../../../services/product-detail.service'
import { describeAuditEntry, type AuditChangeRow, type AuditEntryView } from './audit-format'

const TONE_DOT: Record<AuditEntryView['tone'], string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
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
          <span>{change.after}</span>
        </>
      )}
      {change.kind === 'set' && <span>{change.after}</span>}
      {change.kind === 'removed' && <span className="text-neutral-500">{change.before} (se quitó)</span>}
    </li>
  )
}

function AuditEntry({ log }: { log: AuditLog }) {
  const view = describeAuditEntry(log)
  return (
    <li className="px-4 py-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${TONE_DOT[view.tone]}`} />
        <p className="text-sm text-neutral-800">
          <span className="font-semibold">{view.actor}</span> {view.verb}
        </p>
        <span className="text-xs text-neutral-400">· {view.when}</span>
      </div>
      {view.changes.length > 0 && (
        <ul className="ml-1 pl-3 border-l-2 border-neutral-100 space-y-0.5" aria-label="Cambios realizados">
          {view.changes.map((change) => (
            <ChangeLine key={change.key} change={change} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** Plain-language history of a product: who changed what, when, and the readable old → new values. */
export function ProductAuditTab({ productId }: { productId: string }) {
  const canWrite = useHasPermission('products:write')
  const canReadNotes = useHasPermission('products:notes')
  const canView = canWrite && canReadNotes

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['product-audit', productId, 'operations'],
    queryFn: () => fetchProductAudit('Product', productId),
    enabled: canView,
    retry: false,
  })

  const changes = useInfiniteQuery({
    queryKey: ['product-audit', productId, 'fields'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await api.get(`/products/${productId}/changes`, { params: { limit: 50, cursor: pageParam } })
      return response.data as ProductChangePage
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: canView,
    retry: false,
  })

  if (!canView) {
    return <p className="text-sm text-neutral-400 py-6 text-center">No tienes permisos para ver la auditoría.</p>
  }
  if (isLoading || changes.isLoading) {
    return <p className="text-sm text-neutral-400 py-6 text-center">Cargando auditoría...</p>
  }
  if (error || changes.error) {
    return <Alert variant="error">{getApiErrorMessage(error ?? changes.error, 'No se pudo cargar el historial. Parte de los cambios podría no estar disponible.')}</Alert>
  }
  const entries = [...logs, ...(changes.data?.pages.flatMap((page) => page.items.map(changeAsAuditLog)) ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400 py-6 text-center">Sin eventos de auditoría para este producto.</p>
  }

  return (
    <div className="space-y-3">
    <ol className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg" aria-label="Historial de cambios del producto">
      {entries.map((log) => (
        <AuditEntry key={log.id} log={log} />
      ))}
    </ol>
    {changes.hasNextPage && <button type="button" disabled={changes.isFetchingNextPage} onClick={() => void changes.fetchNextPage()}>Ver cambios anteriores</button>}
    </div>
  )
}

interface ProductChangePage {
  items: { id: string; field: string; oldValue: unknown; newValue: unknown; createdAt: string; actorId: string | null; actorName?: string | null }[]
  nextCursor: string | null
}

function changeAsAuditLog(change: ProductChangePage['items'][number]): AuditLog {
  return {
    id: `field-${change.id}`,
    userId: null,
    action: 'update',
    entity: 'Product',
    entityId: '',
    actorName: change.actorName || (change.actorId ? 'Integrante del equipo' : 'Sistema'),
    oldValues: { [change.field]: change.oldValue },
    newValues: { [change.field]: change.newValue },
    createdAt: change.createdAt,
  }
}
