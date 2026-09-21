import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../services/api'
import {
  fetchListas,
  createLista,
  updateLista,
  toggleListaActive,
  archiveLista,
  restoreLista,
  fetchListaProducts,
  fetchListaPrices,
  fetchListaAssignments,
  fetchListaAudit,
  productCountOf,
  downloadListaTemplateCsv,
  type Lista,
  type ListaPayload,
} from '../services/listas.service'
import { canCreateLista, canDeleteLista, canManageListas, hasPermission } from '../lib/rbac'
import { getApiErrorMessage } from '../lib/apiError'
import { formatDate } from '../lib/format'
import { Button } from '../components/ui'
import { ProductPagination } from '../components/ProductPagination'
import { SearchFilterBar, type SearchFilterChip } from '../components/filters/SearchFilterBar'
import { fetchUsers, type UserListItem } from '../services/users.service'
import { useImportModalStore } from '../features/products/import/store/importModal.store'

const CURRENCIES = ['COP', 'USD', 'EUR'] as const
const LISTA_TYPES = ['mayorista', 'detalle', 'oro', 'platino', 'instalador', 'tienda'] as const
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

type ProductCountFilter = 'all' | 'zero' | 'low' | 'mid' | 'high'
type UpdateFilter = 'all' | '7d' | '30d' | 'older'
type ExpiryDateFilter = 'all' | 'with_expiry' | 'no_expiry'

/** Rango (bucket) de cantidad de productos de una Lista. */
function countBucket(count: number): ProductCountFilter {
  if (count === 0) return 'zero'
  if (count <= 10) return 'low'
  if (count <= 50) return 'mid'
  return 'high'
}

/** Rango de antigüedad de la última actualización. */
function updateBucket(iso: string): UpdateFilter {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'older'
  const days = (Date.now() - t) / 86400000
  if (days <= 7) return '7d'
  if (days <= 30) return '30d'
  return 'older'
}

/** Etiqueta de próxima vigencia (cliente-side, campos validFrom/validUntil). */
function nextExpiryLabel(lista: Lista): { label: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' } {
  if (lista.validUntil) {
    const d = new Date(lista.validUntil)
    if (Number.isNaN(d.getTime())) return { label: 'Sin vigencia', tone: 'neutral' }
    if (lista.isExpired) return { label: `Vencida ${formatDate(lista.validUntil)}`, tone: 'danger' }
    if (lista.isExpiringSoon) return { label: `Vence ${formatDate(lista.validUntil)}`, tone: 'warn' }
    return { label: `Vigente hasta ${formatDate(lista.validUntil)}`, tone: 'ok' }
  }
  if (lista.validFrom) return { label: 'Vigente', tone: 'ok' }
  return { label: 'Sin vigencia', tone: 'neutral' }
}

const EXPIRY_TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-neutral-100 text-neutral-600',
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
}

type ListaStateFilter = 'all' | 'active' | 'inactive' | 'archived'

/** Los tres estados son excluyentes y `archived` gana sobre `isActive`. */
function listaState(lista: { isActive: boolean; archivedAt: string | null }) {
  if (lista.archivedAt !== null) return 'archived' as const
  return lista.isActive ? ('active' as const) : ('inactive' as const)
}

function StatusBadge({ isActive, archived }: { isActive: boolean; archived: boolean }) {
  let label = isActive ? 'Activo' : 'Inactivo'
  let cls = isActive
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-red-100 text-red-700'
  if (archived) {
    label = 'Archivado'
    cls = 'bg-neutral-100 text-neutral-600'
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${cls}`}
      aria-label={label}
    >
      {label}
    </span>
  )
}

// ============================================================
// COMPONENTE DeleteConfirmModal - Confirmación simple sin clave maestra
// ============================================================
function DeleteConfirmModal({
  listas,
  ids,
  onClose,
  onConfirm,
}: {
  listas: Lista[]
  ids: string[]
  onClose: () => void
  onConfirm: (ids: string[]) => void
}) {
  const [confirmed, setConfirmed] = useState(false)

  const listNames = ids
    .map((id) => listas.find((l) => l.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-condensed font-semibold text-neutral-800">Confirmar eliminación</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Esta acción eliminará <strong>{ids.length}</strong> Lista(s) de forma definitiva:
          </p>
          <p className="text-sm text-neutral-700 bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200">
            {listNames || 'Seleccionadas'}
          </p>
          <p className="text-xs text-red-600 font-medium">
            ⚠️ Esta acción no se puede deshacer. Todos los productos y datos asociados se eliminarán.
          </p>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[var(--color-primary)] border-neutral-300 rounded focus:ring-[var(--color-primary-focus-ring)]"
            />
            <span className="text-sm text-neutral-700">
              Confirmo que entiendo que esta acción elimina las listas y sus datos asociados de forma permanente.
            </span>
          </label>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!confirmed}
              onClick={() => onConfirm(ids)}
            >
              Eliminar definitivamente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function ListasPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingLista, setEditingLista] = useState<Lista | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ListaStateFilter>('all')
  const openImportModal = useImportModalStore((s) => s.open)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [indicatorFilter, setIndicatorFilter] = useState<'all' | 'with_prices' | 'no_prices' | 'no_stock'>('all')
  const [productCountFilter, setProductCountFilter] = useState<ProductCountFilter>('all')
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>('all')
  const [expiryDateFilter, setExpiryDateFilter] = useState<ExpiryDateFilter>('all')
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [deleteImpactIds, setDeleteImpactIds] = useState<string[]>([])
  const [deleteImpactError, setDeleteImpactError] = useState<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([])
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['listas'] })

  const { data: listas, isLoading, error } = useQuery({
    queryKey: ['listas'],
    queryFn: fetchListas,
  })

  const baseFiltered = useMemo(() => {
    if (!listas) return []
    return listas.filter((l) => {
      const matchesSearch =
        search.trim() ===
          '' ||
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.code.toLowerCase().includes(search.toLowerCase())
      const matchesState =
        activeFilter === 'all' || listaState(l) === activeFilter
      const matchesExpiry =
        expiryFilter === 'all' ||
        (expiryFilter === 'active' && !l.isExpired && !l.isExpiringSoon) ||
        (expiryFilter === 'expiring' && l.isExpiringSoon && !l.isExpired) ||
        (expiryFilter === 'expired' && l.isExpired)
      const matchesType = typeFilter === 'all' || (l.type ?? '') === typeFilter
      const matchesCount =
        productCountFilter === 'all' || countBucket(l.productCount ?? 0) === productCountFilter
      const matchesUpdate =
        updateFilter === 'all' || updateBucket(l.updatedAt ?? '') === updateFilter
      const matchesExpiryDate =
        expiryDateFilter === 'all' ||
        (expiryDateFilter === 'with_expiry' ? !!l.validUntil : !l.validUntil)
      return (
        matchesSearch && matchesState && matchesExpiry && matchesType &&
        matchesCount && matchesUpdate && matchesExpiryDate
      )
    })
  }, [listas, search, activeFilter, expiryFilter, typeFilter, productCountFilter, updateFilter, expiryDateFilter])

  const indicatorActive = indicatorFilter !== 'all'
  const needsCountEnrichment =
    productCountFilter !== 'all' && baseFiltered.some((l) => l.productCount == null)
  const productsByListaQuery = useQuery({
    queryKey: [
      'lista-products-enrichment',
      baseFiltered.map((l) => l.id).join(','),
      indicatorActive,
      needsCountEnrichment,
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        baseFiltered.map(async (l) => [l.id, await fetchListaProducts(l.id)] as const)
      )
      return new Map(entries)
    },
    enabled: (indicatorActive || needsCountEnrichment) && baseFiltered.length > 0,
  })
  const productsByLista = productsByListaQuery.data ?? new Map<string, any[]>()

  /** Conteo de productos por Lista: _count.products del backend o fallback client-side. */
  const countOf = (l: Lista): number =>
    l.productCount ?? productsByLista.get(l.id)?.length ?? 0

  const filtered = useMemo(() => {
    if (indicatorFilter === 'all') return baseFiltered
    return baseFiltered.filter((l) => {
      const products = productsByLista.get(l.id) ?? []
      const hasPrices = products.some((p) => (p.prices ?? []).length > 0)
      const hasNoStock = products.some(
        (p) =>
          p.stockStatus === 'out_of_stock' ||
          (typeof p.availableQty === 'number' && p.availableQty <= 0)
      )
      if (indicatorFilter === 'with_prices') return hasPrices
      if (indicatorFilter === 'no_prices') return l.productCount !== 0 && !hasPrices
      if (indicatorFilter === 'no_stock') return hasNoStock
      return true
    })
  }, [baseFiltered, indicatorFilter, productsByLista])

  const filteredCount = filtered.length

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, activeFilter, expiryFilter, typeFilter, indicatorFilter, productCountFilter, updateFilter, expiryDateFilter])

  const listFilterCount =
    (activeFilter !== 'all' ? 1 : 0) +
    (expiryFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (indicatorFilter !== 'all' ? 1 : 0) +
    (productCountFilter !== 'all' ? 1 : 0) +
    (updateFilter !== 'all' ? 1 : 0) +
    (expiryDateFilter !== 'all' ? 1 : 0)
  const hasActiveListFilters = listFilterCount > 0

  const clearListFilters = () => {
    setActiveFilter('all')
    setExpiryFilter('all')
    setTypeFilter('all')
    setIndicatorFilter('all')
    setProductCountFilter('all')
    setUpdateFilter('all')
    setExpiryDateFilter('all')
  }

  const listFilterChips: SearchFilterChip[] = []
  if (activeFilter === 'active') listFilterChips.push({ id: 'state-active', label: 'Estado: Activas', onRemove: () => setActiveFilter('all') })
  if (activeFilter === 'inactive') listFilterChips.push({ id: 'state-inactive', label: 'Estado: Inactivas', onRemove: () => setActiveFilter('all') })
  if (activeFilter === 'archived') listFilterChips.push({ id: 'state-archived', label: 'Estado: Archivadas', onRemove: () => setActiveFilter('all') })
  if (expiryFilter === 'active') listFilterChips.push({ id: 'exp-active', label: 'Vigencia: Vigentes', onRemove: () => setExpiryFilter('all') })
  if (expiryFilter === 'expiring') listFilterChips.push({ id: 'exp-expiring', label: 'Vigencia: Por vencer (30 días)', onRemove: () => setExpiryFilter('all') })
  if (expiryFilter === 'expired') listFilterChips.push({ id: 'exp-expired', label: 'Vigencia: Vencidas', onRemove: () => setExpiryFilter('all') })
  if (typeFilter !== 'all') listFilterChips.push({ id: `type-${typeFilter}`, label: `Tipo: ${typeFilter}`, onRemove: () => setTypeFilter('all') })
  if (indicatorFilter === 'with_prices') listFilterChips.push({ id: 'ind-with', label: 'Indicador: Con precios', onRemove: () => setIndicatorFilter('all') })
  if (indicatorFilter === 'no_prices') listFilterChips.push({ id: 'ind-nop', label: 'Indicador: Sin precios', onRemove: () => setIndicatorFilter('all') })
  if (indicatorFilter === 'no_stock') listFilterChips.push({ id: 'ind-stock', label: 'Indicador: Sin stock', onRemove: () => setIndicatorFilter('all') })
  if (productCountFilter === 'zero') listFilterChips.push({ id: 'cnt-zero', label: 'Productos: Sin productos', onRemove: () => setProductCountFilter('all') })
  if (productCountFilter === 'low') listFilterChips.push({ id: 'cnt-low', label: 'Productos: 1-10', onRemove: () => setProductCountFilter('all') })
  if (productCountFilter === 'mid') listFilterChips.push({ id: 'cnt-mid', label: 'Productos: 11-50', onRemove: () => setProductCountFilter('all') })
  if (productCountFilter === 'high') listFilterChips.push({ id: 'cnt-high', label: 'Productos: Más de 50', onRemove: () => setProductCountFilter('all') })
  if (updateFilter === '7d') listFilterChips.push({ id: 'upd-7d', label: 'Actualización: 7 días', onRemove: () => setUpdateFilter('all') })
  if (updateFilter === '30d') listFilterChips.push({ id: 'upd-30d', label: 'Actualización: 30 días', onRemove: () => setUpdateFilter('all') })
  if (updateFilter === 'older') listFilterChips.push({ id: 'upd-older', label: 'Actualización: Sin cambios recientes', onRemove: () => setUpdateFilter('all') })
  if (expiryDateFilter === 'with_expiry') listFilterChips.push({ id: 'expd-with', label: 'Fecha final: Con vencimiento', onRemove: () => setExpiryDateFilter('all') })
  if (expiryDateFilter === 'no_expiry') listFilterChips.push({ id: 'expd-no', label: 'Fecha final: Sin vencimiento', onRemove: () => setExpiryDateFilter('all') })

  const selectFieldClass =
    'w-full px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm bg-white'

  const toggleMutation = useMutation({
    mutationFn: (lista: Lista) => toggleListaActive(lista.id, !lista.isActive),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo cambiar el estado de la Lista')),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveLista(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo archivar la Lista')),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreLista(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
      setActionNotice('Lista restaurada como Inactiva. Activala para volver a usarla.')
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo restaurar la Lista')),
  })

  const batchMutation = useMutation({
    mutationFn: async ({ action, ids }: { action: 'activate' | 'deactivate' | 'archive' | 'restore'; ids: string[] }) => {
      const tasks = ids.map((id) => {
        if (action === 'activate') return updateLista(id, { isActive: true })
        if (action === 'deactivate') return updateLista(id, { isActive: false })
        if (action === 'archive') return archiveLista(id)
        return restoreLista(id)
      })
      await Promise.all(tasks)
    },
    onSuccess: () => {
      invalidate()
      setSelectedIds([])
      setActionError(null)
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo completar la acción masiva')),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/listas/${id}/duplicate`),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 405 || status === 501 || status === 400) {
        setActionError('La duplicación de Listas estará disponible próximamente.')
      } else {
        setActionError(getApiErrorMessage(err, 'No se pudo duplicar la Lista'))
      }
    },
  })

  const deleteMutation = useMutation({
    // El backend exige `confirm: true` para el borrado físico (igual que un
    // producto individual); esta mutación solo se dispara después de que el
    // usuario marcó la casilla de confirmación en el modal, así que siempre
    // se envía en true.
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.delete(`/listas/${id}`, { data: { confirm: true } }))
      )
      let deleted = 0
      let blocked = 0
      let pending = 0
      let deleteBlockedMessage: string | null = null
      for (const r of results) {
        if (r.status === 'fulfilled') {
          deleted += 1
          continue
        }
        const status = (r.reason as { response?: { status?: number } })?.response?.status
        if (status === 400 || status === 403 || status === 409) {
          blocked += 1
          deleteBlockedMessage = getApiErrorMessage(r.reason, 'No se pudo eliminar la Lista')
        } else if (status === 404 || status === 405 || status === 501) {
          pending += 1
        }
      }
      return { deleted, blocked, pending, deleteBlockedMessage }
    },
    onSuccess: (result) => {
      if (result.blocked > 0) {
        setDeleteImpactError(result.deleteBlockedMessage ?? 'No se pudo eliminar la Lista.')
        return
      }
      invalidate()
      setSelectedIds([])
      setDeleteImpactIds([])
      setDeleteImpactError(null)
      setActionError(null)
      const parts: string[] = []
      if (result.deleted > 0) parts.push(`${result.deleted} Lista(s) eliminada(s)`)
      if (result.pending > 0) parts.push('la eliminación de algunas Listas estará disponible próximamente')
      setActionNotice(parts.length > 0 ? parts.join('. ') : 'No se eliminó ninguna Lista')
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo eliminar las Listas seleccionadas')),
  })

  const runBatchDelete = () => {
    const ids = selectedIds.filter((id) => listas?.some((item) => item.id === id))
    if (ids.length === 0) {
      setActionError('No hay Listas seleccionadas para eliminar.')
      return
    }
    setConfirmDeleteIds(ids)
    setConfirmDeleteOpen(true)
  }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selectedIds.includes(l.id))
  const someSelected = selectedIds.length > 0 && !allFilteredSelected

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((l) => l.id === id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filtered.map((l) => l.id)])))
    }
  }

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const runBatch = (action: 'activate' | 'deactivate' | 'archive' | 'restore', label: string) => {
    const ids = selectedIds.filter((id) => {
      const l = listas?.find((item) => item.id === id)
      if (!l) return false
      if (action === 'archive') return !l.archivedAt
      if (action === 'restore') return !!l.archivedAt
      return true
    })
    if (ids.length === 0) {
      setActionError(`No hay Listas seleccionadas que apliquen para ${label.toLowerCase()}.`)
      return
    }
    if (!window.confirm(`¿${label} ${ids.length} lista(s) seleccionada(s)?`)) return
    batchMutation.mutate({ action, ids })
  }

  const listError = error ? getApiErrorMessage(error, 'No se pudieron cargar las Listas') : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-condensed font-bold text-security-800">Listas</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gestión de listas comerciales. Lista es la raíz de productos, precios y permisos.
          </p>
        </div>
        <div className="flex gap-2">
          {hasPermission('products:write') && (
            <Button
              variant="secondary"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
              onClick={() => downloadListaTemplateCsv('plantilla-lista-generica.csv')}
            >
              Descargar plantilla
            </Button>
          )}
          {hasPermission('products:write') && (
            <Button
              variant="secondary"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              }
              onClick={() => openImportModal()}
            >
              Importar desde Excel
            </Button>
          )}
          {canCreateLista() && (
            <Button
              variant="primary"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
              onClick={() => {
                setActionError(null)
                setEditingLista(null)
                setShowCreateModal(true)
              }}
            >
              Nueva Lista
            </Button>
          )}
        </div>
      </div>

      <SearchFilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Buscar por nombre o código...',
          ariaLabel: 'Buscar listas',
        }}
        activeFilterCount={listFilterCount}
        activeFilterChips={listFilterChips}
        onClearFilters={clearListFilters}
        clearFiltersDisabled={listFilterCount === 0}
        layout="sidebar"
        sidebarSections={[
          {
            id: 'categories',
            label: 'Estado',
            content: (
              <fieldset>
                <legend className="text-sm font-medium text-neutral-800 mb-2">Estado</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-estado"
                      checked={activeFilter === 'all'}
                      onChange={() => setActiveFilter('all')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Todas
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-estado"
                      checked={activeFilter === 'active'}
                      onChange={() => setActiveFilter('active')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Activas
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-estado"
                      checked={activeFilter === 'inactive'}
                      onChange={() => setActiveFilter('inactive')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Inactivas
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-estado"
                      checked={activeFilter === 'archived'}
                      onChange={() => setActiveFilter('archived')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Archivadas
                  </label>
                </div>
              </fieldset>
            ),
          },
          {
            id: 'brands',
            label: 'Estado de vigencia',
            content: (
              <fieldset>
                <legend className="text-sm font-medium text-neutral-800 mb-2">Estado de vigencia</legend>
                <p className="text-xs text-neutral-500 mb-2">Clasifica según el estado calculado de la vigencia.</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-vigencia"
                      checked={expiryFilter === 'all'}
                      onChange={() => setExpiryFilter('all')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Todas
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-vigencia"
                      checked={expiryFilter === 'active'}
                      onChange={() => setExpiryFilter('active')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Vigentes
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-vigencia"
                      checked={expiryFilter === 'expiring'}
                      onChange={() => setExpiryFilter('expiring')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Por vencer (30 días)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      name="lista-vigencia"
                      checked={expiryFilter === 'expired'}
                      onChange={() => setExpiryFilter('expired')}
                      className="h-4 w-4 accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                    />
                    Vencidas
                  </label>
                </div>
              </fieldset>
            ),
          },
          {
            id: 'lifecycle',
            label: 'Filtros adicionales',
            content: (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="lista-type" className="block text-sm font-medium text-neutral-800 mb-1.5">Tipo de lista</label>
                  <select id="lista-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectFieldClass}>
                    <option value="all">Todos los tipos</option>
                    {LISTA_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="lista-indicator" className="block text-sm font-medium text-neutral-800 mb-1.5">Indicador de productos</label>
                  <select id="lista-indicator" value={indicatorFilter} onChange={(e) => setIndicatorFilter(e.target.value as typeof indicatorFilter)} className={selectFieldClass}>
                    <option value="all">Todos los indicadores</option>
                    <option value="with_prices">Con precios</option>
                    <option value="no_prices">Sin precios</option>
                    <option value="no_stock">Sin stock</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lista-count" className="block text-sm font-medium text-neutral-800 mb-1.5">Cantidad de productos</label>
                  <select id="lista-count" value={productCountFilter} onChange={(e) => setProductCountFilter(e.target.value as ProductCountFilter)} className={selectFieldClass}>
                    <option value="all">Cualquier cantidad</option>
                    <option value="zero">Sin productos</option>
                    <option value="low">1-10 productos</option>
                    <option value="mid">11-50 productos</option>
                    <option value="high">Más de 50</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lista-update" className="block text-sm font-medium text-neutral-800 mb-1.5">Última actualización</label>
                  <select id="lista-update" value={updateFilter} onChange={(e) => setUpdateFilter(e.target.value as UpdateFilter)} className={selectFieldClass}>
                    <option value="all">Cualquier actualización</option>
                    <option value="7d">Actualizadas (7 días)</option>
                    <option value="30d">Actualizadas (30 días)</option>
                    <option value="older">Sin cambios recientes</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lista-expirydate" className="block text-sm font-medium text-neutral-800 mb-1.5">Fecha de vencimiento</label>
                  <select id="lista-expirydate" value={expiryDateFilter} onChange={(e) => setExpiryDateFilter(e.target.value as ExpiryDateFilter)} className={selectFieldClass}>
                    <option value="all">Cualquier vigencia</option>
                    <option value="with_expiry">Con fecha de vencimiento</option>
                    <option value="no_expiry">Sin fecha de vencimiento</option>
                  </select>
                  <p className="text-xs text-neutral-500 mt-1">Indica si la lista tiene una fecha final de vigencia definida.</p>
                </div>
              </div>
            ),
          },
        ]}
        content={
          <>
            {actionError && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border text-sm bg-red-50 border-red-200 text-red-800" role="alert">
                <span className="flex-1">{actionError}</span>
                <button onClick={() => setActionError(null)} className="p-0.5 rounded hover:bg-red-100/60" aria-label="Cerrar" />
              </div>
            )}

            {actionNotice && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border text-sm bg-emerald-50 border-emerald-200 text-emerald-800" role="status">
                <span className="flex-1">{actionNotice}</span>
                <button onClick={() => setActionNotice(null)} className="p-0.5 rounded hover:bg-emerald-100/60" aria-label="Cerrar" />
              </div>
            )}

            <p className="text-sm text-neutral-500">
              {isLoading ? 'Cargando listas...' : `${filteredCount} resultado(s)`}
            </p>

            {listError && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border text-sm bg-red-50 border-red-200 text-red-800" role="alert">
                <span className="flex-1">{listError}</span>
              </div>
            )}

            {canManageListas() && filtered.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-white rounded-xl border border-neutral-200">
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 accent-[var(--color-primary)] cursor-pointer"
                    aria-label="Seleccionar todas las Listas filtradas"
                  />
                  Seleccionar todas las filtradas
                </label>
                {selectedIds.length > 0 && (
                  <>
                    <span className="text-sm font-medium text-neutral-600">{selectedIds.length} seleccionada(s)</span>
                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-sm text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
                    >
                      Limpiar selección
                    </button>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      <Button variant="secondary" disabled={batchMutation.isPending} onClick={() => runBatch('activate', 'Activar')}>
                        Activar
                      </Button>
                      <Button variant="secondary" disabled={batchMutation.isPending} onClick={() => runBatch('deactivate', 'Desactivar')}>
                        Desactivar
                      </Button>
                      <Button variant="secondary" disabled={batchMutation.isPending} onClick={() => runBatch('archive', 'Archivar')}>
                        Archivar
                      </Button>
                      <Button variant="secondary" disabled={batchMutation.isPending} onClick={() => runBatch('restore', 'Restaurar')}>
                        Restaurar
                      </Button>
                      {canDeleteLista() && (
                        <Button variant="danger" disabled={deleteMutation.isPending} onClick={runBatchDelete}>
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-3">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 animate-pulse">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-neutral-100 rounded w-1/3"></div>
                          <div className="h-3 bg-neutral-100 rounded w-1/4"></div>
                        </div>
                        <div className="h-6 bg-neutral-100 rounded-full w-20"></div>
                      </div>
                    </div>
                  ))
                : filtered.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200 text-center py-16">
                    <svg className="w-16 h-16 text-neutral-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-neutral-500 font-medium">No tienes Listas asignadas</p>
                    <p className="text-neutral-400 text-sm mt-1">
                      {search || hasActiveListFilters
                        ? 'Intenta ajustar los filtros de búsqueda.'
                        : canManageListas()
                          ? 'No tienes permisos para ver ninguna Lista. Contacta al administrador.'
                          : 'No tienes listas asignadas. Solicita acceso a tu administrador.'}
                    </p>
                  </div>
                ) : (
                  paged.map((lista) => (
                    <div
                      key={lista.id}
                      className="bg-white rounded-xl border border-neutral-200 p-5 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          {canManageListas() && (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(lista.id)}
                              onChange={() => toggleSelect(lista.id)}
                              className="mt-3 h-4 w-4 accent-[var(--color-primary)] cursor-pointer"
                              aria-label={`Seleccionar ${lista.name}`}
                            />
                          )}
                          <div className="w-12 h-12 bg-[var(--color-primary-bg-subtle)] rounded-xl flex items-center justify-center text-[var(--color-primary)] flex-shrink-0">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/commercial/lists/${lista.id}`}
                              className="text-sm font-semibold text-gray-900 hover:text-[var(--color-primary)] focus:outline-none"
                            >
                              {lista.name}
                            </Link>
                            <p className="text-xs text-neutral-400 font-mono">{lista.code} · {lista.currency}</p>
                            {(lista.isExpiringSoon || lista.isExpired) && typeof lista.daysUntilExpiry === 'number' && (
                              <p className={`text-xs font-medium mt-0.5 ${lista.isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                                {lista.isExpired
                                  ? `Vencida hace ${Math.abs(lista.daysUntilExpiry)} día(s)`
                                  : `Vence en ${lista.daysUntilExpiry} día(s)`}
                              </p>
                            )}
                            {lista.description && (
                              <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{lista.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <StatusBadge isActive={lista.isActive} archived={lista.archivedAt !== null} />
                          {lista.isExpiringSoon && (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                              Por vencer
                            </span>
                          )}
                          {lista.isExpired && (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
                              Vencida
                            </span>
                          )}
                          <span className="text-xs text-neutral-500 whitespace-nowrap">
                            {countOf(lista)} producto(s)
                          </span>
                          {(() => {
                            const expiry = nextExpiryLabel(lista)
                            return (
                              <span
                                className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${EXPIRY_TONE_CLASSES[expiry.tone]}`}
                                title="Próxima vigencia"
                              >
                                {expiry.label}
                              </span>
                            )
                          })()}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs text-neutral-400">Actualizado: {formatDate(lista.updatedAt)}</span>
                        <div className="flex items-center gap-1">
                          {canManageListas() && !lista.archivedAt && (
                            <>
                              <button
                                onClick={() => {
                                  setActionError(null)
                                  duplicateMutation.mutate(lista.id)
                                }}
                                className="p-2 text-neutral-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                                title="Duplicar Lista"
                                aria-label="Duplicar Lista"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setActionError(null)
                                  setEditingLista(lista)
                                  setShowCreateModal(true)
                                }}
                                className="p-2 text-neutral-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                                title="Editar Lista"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setActionError(null)
                                  toggleMutation.mutate(lista)
                                }}
                                className="p-2 text-neutral-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                                title={lista.isActive ? 'Desactivar Lista' : 'Activar Lista'}
                                aria-label={lista.isActive ? 'Desactivar Lista' : 'Activar Lista'}
                              >
                                {lista.isActive ? (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636M12 3a9 9 0 019 9 9 9 0 01-9 9 9 9 0 01-9-9 9 9 0 019-9z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm('¿Archivar esta Lista? No se podrán crear productos nuevos mientras esté archivada.')) {
                                    archiveMutation.mutate(lista.id)
                                  }
                                }}
                                className="p-2 text-neutral-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                                title="Archivar Lista"
                                aria-label="Archivar Lista"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 7v10a2 2 0 002 2h10a2 2 0 012-2V7M9 12h6" />
                                </svg>
                              </button>
                            </>
                          )}
                          {canManageListas() && lista.archivedAt && (
                            <button
                              onClick={() => restoreMutation.mutate(lista.id)}
                              className="p-2 text-neutral-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
                              title="Restaurar Lista"
                              aria-label="Restaurar Lista"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h4l3-3m0 0l-3 3m3-3v10a2 2 0 002 2h1.07m-7.43 0a2 2 0 01-.58-1.4l-2-8M7 17h10a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
            </div>

            {filtered.length > 0 && (
              <ProductPagination
                page={currentPage}
                totalPages={totalPages}
                total={filtered.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            )}
          </>
        }
      />

      {(showCreateModal || editingLista) && (
        <ListasFormModal
          lista={editingLista}
          onClose={() => {
            setShowCreateModal(false)
            setEditingLista(null)
          }}
          onSaved={() => {
            invalidate()
            setShowCreateModal(false)
            setEditingLista(null)
          }}
          onError={(err) => setActionError(getApiErrorMessage(err, 'No se pudo guardar la Lista'))}
        />
      )}

      {/* Modal de confirmación simple */}
      {confirmDeleteOpen && confirmDeleteIds.length > 0 && (
        <DeleteConfirmModal
          listas={listas ?? []}
          ids={confirmDeleteIds}
          onClose={() => {
            setConfirmDeleteOpen(false)
            setConfirmDeleteIds([])
          }}
          onConfirm={(ids) => {
            setConfirmDeleteOpen(false)
            setConfirmDeleteIds([])
            deleteMutation.mutate({ ids })
          }}
        />
      )}

      {/* Modal legacy de impacto (ya no se usa para eliminación directa) */}
      {deleteImpactIds.length > 0 && (
        <DeleteImpactModal
          listas={listas ?? []}
          ids={deleteImpactIds}
          error={deleteImpactError}
          onClose={() => {
            setDeleteImpactIds([])
            setDeleteImpactError(null)
          }}
          onConfirm={(ids) => {
            setDeleteImpactError(null)
            deleteMutation.mutate({ ids })
          }}
        />
      )}
    </div>
  )
}

function DeleteImpactModal({
  listas,
  ids,
  onClose,
  onConfirm,
  error,
}: {
  listas: Lista[]
  ids: string[]
  onClose: () => void
  onConfirm: (ids: string[], masterKey: string) => void
  error?: string | null
}) {
  const [masterKey, setMasterKey] = useState('')
  const { data, isLoading, error: impactQueryError } = useQuery({
    queryKey: ['lista-delete-impact', ids.join(',')],
    queryFn: async () => {
      const [prices, assignments, audit] = await Promise.all([
        Promise.all(ids.map((id) => fetchListaPrices(id).catch(() => [] as any[]))),
        Promise.all(ids.map((id) => fetchListaAssignments(id).catch(() => [] as any[]))),
        Promise.all(ids.map((id) => fetchListaAudit(id).catch(() => [] as any[]))),
      ])
      const products = ids.reduce((acc, id) => acc + productCountOf(listas.find((l) => l.id === id)), 0)
      return {
        products,
        prices: prices.flat().length,
        assignments: assignments.flat().length,
        audit: audit.flat().length,
      }
    },
    enabled: ids.length > 0,
    staleTime: 0,
  })

  const impactError = impactQueryError ? getApiErrorMessage(impactQueryError, 'No se pudo calcular el impacto') : null
  const requiresKey =
    (data?.products ?? 0) > 0 || (data?.prices ?? 0) > 0 || (data?.assignments ?? 0) > 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-condensed font-semibold text-neutral-800">Confirmar eliminación</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-neutral-400">Calculando impacto...</p>
          ) : (
            <>
              {impactError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5" role="alert">
                  {impactError}
                </p>
              )}
              <p className="text-sm text-neutral-600">
                Esta acción eliminará la Lista y afectará aproximadamente a{' '}
                <strong>{data?.products ?? 0} productos</strong>,{' '}
                <strong>{data?.prices ?? 0} precios</strong> y{' '}
                <strong>{data?.assignments ?? 0} asignaciones</strong>
                {data && data.audit > 0 ? '. El historial de auditoría se conservará como registro del borrado' : ''}.
                Esta acción no se puede deshacer.
              </p>
              <p className="text-xs text-neutral-400">
                {ids.length} Lista(s) seleccionada(s):{' '}
                {ids
                  .map((id) => listas.find((l) => l.id === id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </>
          )}

          {!isLoading && requiresKey && (
            <div>
              <label htmlFor="delete-master-key" className="block text-sm font-medium text-neutral-800 mb-1.5">
                Clave maestra
              </label>
              <input
                id="delete-master-key"
                type="password"
                value={masterKey}
                onChange={(e) => setMasterKey(e.target.value)}
                autoComplete="off"
                placeholder="••••••"
                className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                Esta lista tiene datos asociados. Ingresa la clave maestra para eliminar.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-lg border text-sm bg-red-50 border-red-200 text-red-700" role="alert">
              <span className="flex-1">{error}</span>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isLoading || (requiresKey && masterKey.length === 0)}
              onClick={() => onConfirm(ids, masterKey)}
            >
              Eliminar definitivamente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ListasFormModal({
  lista,
  onClose,
  onSaved,
  onError,
}: {
  lista?: Lista | null
  onClose: () => void
  onSaved: () => void
  onError: (error: unknown) => void
}) {
  const [form, setForm] = useState<ListaPayload>({
    name: lista?.name || '',
    code: lista?.code || '',
    description: lista?.description ?? null,
    currency: lista?.currency || 'COP',
    isActive: lista?.isActive ?? true,
    type: lista?.type ?? '',
    defaultVisibility: lista?.defaultVisibility ?? false,
    responsibleId: lista?.responsibleId ?? '',
    validFrom: lista?.validFrom ? lista.validFrom.slice(0, 10) : '',
    validUntil: lista?.validUntil ? lista.validUntil.slice(0, 10) : '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const isEditing = Boolean(lista)

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchUsers(),
  })
  const usersList = (users ?? []) as UserListItem[]

  const mutation = useMutation({
    mutationFn: (payload: ListaPayload) =>
      isEditing && lista ? updateLista(lista.id, payload) : createLista(payload),
    onSuccess: onSaved,
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'No se pudo guardar la Lista'))
      onError(err)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const payload: ListaPayload = {
      name: form.name.trim(),
      code: form.code.trim(),
      description: form.description?.trim() || null,
      currency: form.currency,
      isActive: form.isActive,
      type: form.type || null,
      defaultVisibility: form.defaultVisibility ?? false,
      responsibleId: form.responsibleId || null,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
    }
    if (payload.name.length < 2 || payload.code.length < 2) {
      setFormError('Nombre y código deben tener al menos 2 caracteres')
      return
    }
    if (payload.validFrom && payload.validUntil && payload.validFrom > payload.validUntil) {
      setFormError('La fecha de inicio de vigencia no puede ser posterior a la de fin')
      return
    }
    mutation.mutate(payload)
  }

  const fieldClass =
    'w-full px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-condensed font-semibold text-neutral-800">
            {isEditing ? 'Editar Lista' : 'Nueva Lista'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm" role="alert">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="lista-name" className="block text-sm font-medium text-neutral-800 mb-1.5">Nombre</label>
            <input id="lista-name" type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} required minLength={2} />
          </div>

          <div>
            <label htmlFor="lista-code" className="block text-sm font-medium text-neutral-800 mb-1.5">Código</label>
            <input id="lista-code" type="text" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} className={fieldClass} required minLength={2} disabled={isEditing} aria-disabled={isEditing} />
            {isEditing && <p className="text-xs text-neutral-400 mt-1">El código no puede modificarse.</p>}
          </div>

          <div>
            <label htmlFor="lista-currency" className="block text-sm font-medium text-neutral-800 mb-1.5">Moneda</label>
            <select id="lista-currency" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })} className={fieldClass} required>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lista-type" className="block text-sm font-medium text-neutral-800 mb-1.5">Tipo</label>
            <select id="lista-type" value={form.type ?? ''}
              onChange={(e) => setForm({ ...form, type: e.target.value })} className={fieldClass}>
              <option value="">Sin tipo</option>
              {LISTA_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 cursor-pointer">
              <input type="checkbox" checked={!!form.defaultVisibility}
                onChange={(e) => setForm({ ...form, defaultVisibility: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)] cursor-pointer" />
              Visibilidad por defecto para productos nuevos
            </label>
          </div>

          <div>
            <label htmlFor="lista-responsible" className="block text-sm font-medium text-neutral-800 mb-1.5">Responsable</label>
            <select id="lista-responsible" value={form.responsibleId ?? ''}
              onChange={(e) => setForm({ ...form, responsibleId: e.target.value })} className={fieldClass}>
              <option value="">Sin responsable</option>
              {isLoadingUsers
                ? <option value="" disabled>Cargando usuarios...</option>
                : usersList.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="lista-valid-from" className="block text-sm font-medium text-neutral-800 mb-1.5">Vigencia desde</label>
              <input id="lista-valid-from" type="date" value={form.validFrom ?? ''}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="lista-valid-until" className="block text-sm font-medium text-neutral-800 mb-1.5">Vigencia hasta</label>
              <input id="lista-valid-until" type="date" value={form.validUntil ?? ''}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <div>
            <label htmlFor="lista-description" className="block text-sm font-medium text-neutral-800 mb-1.5">Descripción</label>
            <textarea id="lista-description" value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${fieldClass} resize-none`} rows={3} />
          </div>

          {isEditing && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 cursor-pointer">
                <input type="checkbox" checked={!!form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-primary)] cursor-pointer" />
                Lista activa
              </label>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t border-neutral-200">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={mutation.isPending}>{isEditing ? 'Actualizar' : 'Crear'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}