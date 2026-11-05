import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { resolveAssetUrl } from '../services/api'
import type {
  Product,
  Category,
  Brand,
  PriceList,
  LifecycleEvent,
  LifecycleStatus,
} from '../features/products/types/product.types'
import {
  LIFECYCLE_EVENT_HINT,
  LIFECYCLE_EVENT_LABEL,
  LIFECYCLE_STATUS_LABEL,
  effectiveLifecycleStatus,
  hasActiveScheduling,
  toDatetimeLocal,
  fromDatetimeLocal,
} from '../features/products/lib/lifecycle'
import { usePriceLists } from '../features/products/hooks/usePriceLists'
import { getApiErrorMessage } from '../lib/apiError'
import { formatCurrency, formatDate } from '../lib/format'
import { hasPermission, hasAnyRole } from '../lib/rbac'
import { Button, Modal, Alert } from '../components/ui'
import {
  useTransitionProduct,
  getTransitionHttpStatus,
} from '../features/products/hooks/useProductTransition'
import {
  deleteProduct,
  schedulePublish,
  cancelScheduledPublish,
  type TransitionPayload,
} from '../services/product-detail.service'
import { ProductFichaTab } from '../features/products/sheet/ProductFichaTab'
import { ProductPricesSection } from '../features/products/prices/ProductPricesSection'
import { ValidationSection } from '../features/catalog-validation/ValidationSection'
import { ProductPublicationSection } from '../features/catalog-publication/ProductPublicationPanel'
import { visibleDetailTabs, type DetailTab } from '../features/products/lib/product-detail-access'

// "Ficha" is the single editing surface: general information, photos, public sheet and attributes.
const PRICE_LIST_ORDER = [
  'CLIENTE_FINAL_IVA',
  'DPP_ORO_IVA',
  'DPP_PLATINO_IVA',
  'TIENDA_IVA',
  'ORO_SIN_IVA',
  'INSTALADOR_IVA',
  'INSTALLER_SIN_IVA',
]

const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm'

/** Eventos FSM que se disparan de forma directa (sin modal). */
const DIRECT_TRANSITIONS: LifecycleEvent[] = ['PUBLISH', 'UNPUBLISH']

/**
 * Colores de fondo sólido por estado de ciclo de vida (WCAG AA ≥ 4.5:1 con
 * texto blanco). Solo los tres estados canónicos.
 */
const LIFECYCLE_STATUS_BG: Record<LifecycleStatus, string> = {
  DRAFT: 'bg-amber-700', // #b45309 · blanco = 5.02:1
  PUBLISHED: 'bg-sky-700', // #0369a1 · blanco = 5.93:1
  ARCHIVED: 'bg-gray-700', // #374151 · blanco = 10.31:1
}

function findPrice(product: Product, priceListId: string) {
  return product.prices?.find((p) => p.priceList.id === priceListId)
}

function orderedPriceLists(lists: PriceList[]): PriceList[] {
  const byCode = new Map(lists.map((l) => [l.code, l]))
  const ordered = PRICE_LIST_ORDER.map((code) => byCode.get(code)).filter(
    Boolean,
  ) as PriceList[]
  const extras = lists.filter((l) => !PRICE_LIST_ORDER.includes(l.code))
  return [...ordered, ...extras]
}

/** Formatea una fecha/hora de programación en horario local con locale es-CO (sin librerías). */
function formatScheduleDatetime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

// ------------------------------ Publicación (ciclo de vida FSM) ------------------------------
export function PublishTab({
  product,
  allowed,
  canPublish,
  canWrite,
  pending,
  error,
  onDirect,
  onOpenAction,
  onDelete,
  scheduleActive,
  scheduledAt,
  onSchedule,
  onReprogram,
  onCancelSchedule,
}: {
  product: Product
  allowed: LifecycleEvent[]
  canPublish: boolean
  canWrite: boolean
  pending: boolean
  error: unknown
  onDirect: (event: LifecycleEvent) => void
  onOpenAction: (event: LifecycleEvent) => void
  onDelete: () => void
  scheduleActive: boolean
  scheduledAt: string | null
  onSchedule: () => void
  onReprogram: () => void
  onCancelSchedule: () => void
}) {
  const status = effectiveLifecycleStatus(product)
  const hasError = Boolean(error)
  const statusBadge = (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LIFECYCLE_STATUS_BG[status]} text-white`}
    >
      {LIFECYCLE_STATUS_LABEL[status]}
    </span>
  )

  const can = (event: LifecycleEvent) => allowed.includes(event)
  const canSchedule = status === 'DRAFT' && can('PUBLISH')

  const actionButton = (event: LifecycleEvent) => {
    const enabled = can(event)
    const label = LIFECYCLE_EVENT_LABEL[event]
    const hintId = `evt-hint-${event}`
    const handleClick = () => {
      if (DIRECT_TRANSITIONS.includes(event)) onDirect(event)
      else onOpenAction(event)
    }
    return (
      <span key={event} className="inline-flex">
        <button
          type="button"
          disabled={!enabled || pending}
          onClick={handleClick}
          aria-describedby={enabled ? undefined : hintId}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 hover:border-security-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {label}
        </button>
        {!enabled && (
          <span id={hintId} className="sr-only">
            {LIFECYCLE_EVENT_HINT[event]}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-600">Estado de ciclo de vida:</span>
        {statusBadge}
      </div>

      {scheduleActive && scheduledAt && (
        <p className="text-xs text-neutral-600" role="status">
          Publicación programada: {formatScheduleDatetime(scheduledAt)}
        </p>
      )}

      {hasError && (
        <Alert variant="error">{getApiErrorMessage(error, 'No se pudo aplicar la acción.')}</Alert>
      )}

      {(canPublish || canWrite) && (
        <div className="flex flex-wrap gap-2">
          {canPublish && actionButton('PUBLISH')}
          {canPublish && canSchedule &&
            (scheduleActive ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onReprogram}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 hover:border-security-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Reprogramar publicación
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onCancelSchedule}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar programación
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={onSchedule}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 hover:border-security-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Programar publicación
              </button>
            ))}
          {canPublish && actionButton('UNPUBLISH')}
          {canWrite && actionButton('ARCHIVE')}
          {canWrite && actionButton('RESTORE')}
          {canWrite && hasPermission('products:delete') && (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------ Modal de programar/reprogramar ------------------------------
function SchedulePublishModal({
  open,
  initialValue,
  isReprogram,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean
  initialValue: string
  isReprogram: boolean
  loading: boolean
  error: unknown
  onClose: () => void
  onConfirm: (iso: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const [localError, setLocalError] = useState('')

  const title = isReprogram ? 'Reprogramar publicación' : 'Programar publicación'
  const confirmLabel = isReprogram ? 'Reprogramar' : 'Programar'

  const handleConfirm = () => {
    if (!value) {
      setLocalError('Selecciona una fecha y hora de publicación.')
      return
    }
    const when = new Date(value)
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setLocalError('La fecha y hora debe ser posterior al momento actual.')
      return
    }
    setLocalError('')
    onConfirm(fromDatetimeLocal(value))
  }

  const apiMessage = error ? getApiErrorMessage(error, 'No se pudo guardar la programación.') : ''

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onClose()
      }}
      title={title}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={loading} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={loading} disabled={loading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          El producto seguirá en Borrador hasta la fecha seleccionada.
        </p>
        {localError && (
          <div role="alert" aria-live="polite">
            <Alert variant="error">{localError}</Alert>
          </div>
        )}
        {apiMessage && (
          <div role="alert" aria-live="polite">
            <Alert variant="error">{apiMessage}</Alert>
          </div>
        )}
        <div>
          <label htmlFor="schedule-publish-datetime" className="block text-sm font-medium text-neutral-800 mb-1.5">
            Fecha y hora de publicación
          </label>
          <input
            id="schedule-publish-datetime"
            type="datetime-local"
            value={value}
            disabled={loading}
            onChange={(e) => {
              setValue(e.target.value)
              setLocalError('')
            }}
            className={inputClass}
            required
          />
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------ Modal de cancelación de programación ------------------------------
function CancelScheduleModal({
  open,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean
  loading: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}) {
  const apiMessage = error ? getApiErrorMessage(error, 'No se pudo cancelar la programación.') : ''

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onClose()
      }}
      title="Cancelar publicación programada"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={loading} onClick={onClose}>
            Volver
          </Button>
          <Button type="button" variant="danger" loading={loading} disabled={loading} onClick={onConfirm}>
            Cancelar programación
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          ¿Cancelar la publicación programada?
          <br />
          El producto continuará en Borrador y no se publicará automáticamente en la fecha programada.
        </p>
        {apiMessage && (
          <div role="alert" aria-live="polite">
            <Alert variant="error">{apiMessage}</Alert>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------ Modal de motivo/confirmación ------------------------------
/** Eventos que requieren modal de motivo/confirmación (solo ARCHIVE/RESTORE). */
type LifecycleModalEvent = 'ARCHIVE' | 'RESTORE'

const LIFECYCLE_MODAL_META: Record<
  LifecycleModalEvent,
  { title: string; description: string; confirmLabel: string }
> = {
  ARCHIVE: {
    title: 'Archivar producto',
    description:
      'El producto se archivará y dejará de estar disponible comercialmente. Esta acción requiere motivo y confirmación.',
    confirmLabel: 'Archivar',
  },
  RESTORE: {
    title: 'Restaurar producto',
    description:
      'El producto saldrá del archivo y volverá a estar disponible para gestión. Esta acción requiere motivo y confirmación.',
    confirmLabel: 'Restaurar',
  },
}

function LifecycleConfirmModal({
  event,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  event: LifecycleModalEvent
  loading: boolean
  error: unknown
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [formError, setFormError] = useState('')

  // ARCHIVE y RESTORE exigen motivo y confirmación en el backend.
  const requiresReason = true
  const requiresConfirm = true
  const meta = LIFECYCLE_MODAL_META[event]

  const handleConfirm = () => {
    if (requiresReason && !reason.trim()) {
      setFormError('El motivo es obligatorio.')
      return
    }
    if (requiresConfirm && !confirmed) {
      setFormError('Debes marcar la confirmación.')
      return
    }
    setFormError('')
    onConfirm(reason.trim())
  }

  const alertMessage =
    formError || (error ? getApiErrorMessage(error, 'No se pudo completar la acción.') : '')

  return (
    <Modal
      open
      onClose={() => {
        if (!loading) onClose()
      }}
      title={meta.title}
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={loading} onClick={handleConfirm}>
            {meta.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {alertMessage && <Alert variant="error">{alertMessage}</Alert>}
        <p className="text-sm text-neutral-600">{meta.description}</p>
        {requiresReason && (
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">
              Motivo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputClass} resize-none`}
              rows={3}
              maxLength={300}
              placeholder="Indica el motivo de la acción"
            />
          </div>
        )}
        {requiresConfirm && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[var(--color-primary)] border-neutral-300 rounded focus:ring-[var(--color-primary-focus-ring)]"
            />
            <span className="text-sm text-neutral-700">
              Confirmo que entiendo que esta acción no se puede deshacer.
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------ Modal de borrado físico ------------------------------
function DeleteProductModal({
  loading,
  error,
  onClose,
  onConfirm,
}: {
  loading: boolean
  error: unknown
  onClose: () => void
  onConfirm: (opts: { clave?: string; masterKey?: string }) => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [clave, setClave] = useState('')
  const [masterKey, setMasterKey] = useState('')
  const [formError, setFormError] = useState('')

  const status = getTransitionHttpStatus(error)
  const errorCode = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
  const needsClave = errorCode === 'CLAVE_USUARIO_REQUERIDA' || errorCode === 'CLAVE_USUARIO_INCORRECTA'
  const needsMasterKey = status === 409 || status === 403
  const errorMessage = error ? getApiErrorMessage(error, 'No se pudo eliminar el producto.') : null

  const handleConfirm = () => {
    if (!confirmed) {
      setFormError('Debes confirmar el borrado.')
      return
    }
    if (needsClave && !clave.trim()) {
      setFormError('La clave del usuario es obligatoria para eliminar este producto.')
      return
    }
    if (needsMasterKey && !masterKey.trim()) {
      setFormError('La clave maestra es obligatoria para eliminar este producto.')
      return
    }
    setFormError('')
    const opts: { clave?: string; masterKey?: string } = {}
    if (needsClave) opts.clave = clave.trim()
    if (needsMasterKey) opts.masterKey = masterKey.trim()
    onConfirm(opts)
  }

  const alertMessage = formError || errorMessage || ''

  return (
    <Modal
      open
      onClose={() => {
        if (!loading) onClose()
      }}
      title="Eliminar producto"
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={loading} onClick={handleConfirm}>
            {needsClave || needsMasterKey ? 'Eliminar con clave' : 'Eliminar producto'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {alertMessage && <Alert variant="error">{alertMessage}</Alert>}
        <p className="text-sm text-neutral-600">
          Esta acción elimina el producto definitivamente (incluye precios e imágenes asociados).{' '}
          <strong>No se puede deshacer.</strong>
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 text-[var(--color-primary)] border-neutral-300 rounded focus:ring-[var(--color-primary-focus-ring)]"
          />
          <span className="text-sm text-neutral-700">
            Confirmo que entiendo el alcance de esta acción y que no se puede deshacer.
          </span>
        </label>

        {needsClave && (
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">
              Clave del usuario
            </label>
            <input
              id="delete-product-clave"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••"
              className={inputClass}
            />
            <p className="text-xs text-neutral-500 mt-1.5">
              {errorCode === 'CLAVE_USUARIO_INCORRECTA'
                ? 'Clave incorrecta. Inténtalo de nuevo.'
                : 'Ingresa tu clave para confirmar la eliminación.'}
            </p>
          </div>
        )}

        {needsMasterKey && (
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">
              Clave maestra
            </label>
            <input
              id="delete-product-master-key"
              type="password"
              value={masterKey}
              onChange={(e) => setMasterKey(e.target.value)}
              autoComplete="off"
              placeholder="••••••"
              className={inputClass}
            />
            <p className="text-xs text-neutral-500 mt-1.5">
              El producto tiene datos asociados. Ingresa la clave maestra para eliminar.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------ Página ------------------------------
export type ProductDetailMode = 'read' | 'publication'

export default function ProductDetailPage({ mode = 'read' }: { mode?: ProductDetailMode }) {
  const { productId, listaId } = useParams<{ productId: string; listaId?: string }>()
  const navigate = useNavigate()
  const isPublicationMode = mode === 'publication'
  // Modo contextual (desde Lista) → operativo; sin listaId → catálogo global read-only.
  const isContextual = Boolean(listaId)
  const [tab, setTab] = useState<DetailTab>(isPublicationMode ? 'publish' : 'ficha')
  const [selectedImage, setSelectedImage] = useState(0)
  const [lifecycleModal, setLifecycleModal] = useState<{ event: LifecycleModalEvent } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [scheduleModal, setScheduleModal] = useState<{ isReprogram: boolean } | null>(null)
  const [cancelScheduleOpen, setCancelScheduleOpen] = useState(false)
  const [fichaDirty, setFichaDirty] = useState(false)

  const queryClient = useQueryClient()

  // ============ TODOS LOS HOOKS DE QUERY AQUÍ (antes de cualquier return) ============
  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}`)
      return res.data as Product
    },
    enabled: Boolean(productId),
    retry: 1,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories')
      return (res.data as { data: Category[] }).data
    },
  })

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const res = await api.get('/brands')
      return (res.data as { data: Brand[] }).data
    },
  })

  const transition = useTransitionProduct(productId)

  // ============ HOOKS DE MUTATION (SIEMPRE SE LLAMAN, INDEPENDIENTEMENTE DE product) ============
  const deleteMutation = useMutation({
    mutationFn: (opts?: { clave?: string; masterKey?: string }) => {
      if (!product) return Promise.reject(new Error('Producto no cargado'))
      return deleteProduct(product.id, opts)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'all' })
      navigate('/commercial/products')
    },
  })

  const scheduleMutation = useMutation({
    mutationFn: (iso: string) => {
      if (!product) return Promise.reject(new Error('Producto no cargado'))
      return schedulePublish(product.id, { publishAt: iso })
    },
    onSuccess: () => {
      setScheduleModal(null)
      queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'all' })
      if (product) queryClient.invalidateQueries({ queryKey: ['product', product.id] })
    },
  })

  const cancelScheduleMutation = useMutation({
    mutationFn: () => {
      if (!product) return Promise.reject(new Error('Producto no cargado'))
      return cancelScheduledPublish(product.id)
    },
    onSuccess: () => {
      setCancelScheduleOpen(false)
      queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'all' })
      if (product) queryClient.invalidateQueries({ queryKey: ['product', product.id] })
    },
  })

  const { priceLists } = usePriceLists()
  // The regular product detail is always consultation. Editing belongs to the Fichas tab (sheets) and the Precios tab (prices).
  const canEdit = false

  const canReadPrices = hasPermission('prices:read') || hasAnyRole(['Super Admin'])
  const canPublish = isPublicationMode && hasPermission('products:publish')
  const visibleTabs = visibleDetailTabs({ mode, canReadPrices })
  const effectiveTab: DetailTab = visibleTabs.some((t) => t.id === tab) ? tab : 'ficha'

  // ============ RETORNOS CONDICIONALES (ahora después de todos los hooks) ============
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 bg-neutral-100 rounded w-1/4 animate-pulse"></div>
        <div className="border border-neutral-200 rounded-xl p-6 animate-pulse">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="h-64 bg-neutral-100 rounded animate-pulse"></div>
            <div className="lg:col-span-2 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-neutral-100 rounded w-3/4"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="space-y-6">
        <Link
          to="/commercial/products"
          className="text-sm text-security-600 hover:text-security-700"
        >
          ← Volver a Productos
        </Link>
        <div className="border border-neutral-200 rounded-xl p-6 text-center text-neutral-500">
          <p>No se pudo cargar el producto.</p>
          <p className="text-xs mt-1">
            {error
              ? getApiErrorMessage(error, 'Error desconocido')
              : 'Producto no encontrado'}
          </p>
        </div>
      </div>
    )
  }

  // ============ EL RESTO DEL CÓDIGO (ahora product existe con seguridad) ============
  const orderedLists = orderedPriceLists(priceLists)

  const detailAllowed = product.allowedActions ?? []
  const effectiveStatus = effectiveLifecycleStatus(product)

  const runTransition = (payload: TransitionPayload) => {
    transition.mutate(payload, {
      onSuccess: () => {
        setLifecycleModal(null)
      },
    })
  }

  const handleDeleteOpen = () => {
    deleteMutation.reset()
    setDeleteOpen(true)
  }

  const scheduleActive = hasActiveScheduling(product)
  const scheduledAt = product.publishAt && hasActiveScheduling(product) ? product.publishAt : null

  const openSchedule = () => {
    scheduleMutation.reset()
    setScheduleModal({ isReprogram: false })
  }
  const openReprogram = () => {
    scheduleMutation.reset()
    setScheduleModal({ isReprogram: true })
  }
  const openCancelSchedule = () => {
    cancelScheduleMutation.reset()
    setCancelScheduleOpen(true)
  }
  const confirmCancelSchedule = () => cancelScheduleMutation.mutate()

  const effectiveStatusBadgeClass = LIFECYCLE_STATUS_BG[effectiveStatus]

  const finalPrice = orderedLists.reduce<PriceList | null>((acc, list) => {
    if (acc) return acc
    const price = findPrice(product, list.id)
    if (price && Number(price.value) > 0) return list
    return acc
  }, null)

  const finalPriceValue = finalPrice ? findPrice(product, finalPrice.id) : undefined
  const priceWithIva = finalPriceValue ? Number(finalPriceValue.value) : undefined

  const gallery = product.images.length > 0 ? product.images : []
  const mainImage = resolveAssetUrl(
    gallery[selectedImage]?.url || product.images[0]?.url || null,
  ) || null

  // ============ RENDER ============
  return (
    <div className="space-y-6 pb-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-neutral-500 flex-wrap">
          {isPublicationMode ? (
            <>
              <li><Link to="/catalog-management/publication" className="hover:text-security-600">Bandeja de publicación</Link></li>
              <li aria-hidden>›</li>
              <li className="text-neutral-700">{product.brand?.name || 'Producto'}</li>
            </>
          ) : isContextual ? (
            <>
              <li>
                <Link to="/commercial/products" className="hover:text-security-600">
                  Productos
                </Link>
              </li>
              <li aria-hidden>›</li>
              <li>
                <span>Biblioteca</span>
              </li>
              <li aria-hidden>›</li>
              <li className="text-neutral-700">
                {product.brand?.name || 'Producto'}
              </li>
            </>
          ) : (
            <>
              <li>
                <Link to="/commercial/products" className="hover:text-security-600">
                  Productos
                </Link>
              </li>
              <li aria-hidden>›</li>
              <li className="text-neutral-700">
                {product.brand?.name || 'Producto'}
              </li>
            </>
          )}
        </ol>
      </nav>

      <p className="text-sm text-neutral-500">
        {isPublicationMode
          ? 'Revisa la validación y administra la publicación de este producto.'
          : 'Consulta de catálogo. Las fichas se editan en la pestaña Fichas y los precios se cargan en la pestaña Precios.'}
      </p>

      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <div className="lg:flex lg:gap-0 lg:items-stretch">
          <div className="lg:w-1/2 xl:w-2/5 relative">
            <div className="aspect-[4/3] bg-gradient-to-br from-neutral-50 to-neutral-100 flex items-center justify-center">
              {mainImage ? (
                <img
                  src={mainImage}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <svg
                  className="w-24 h-24 text-neutral-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              )}
            </div>

            <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10">
              <span className={`px-2.5 py-1 text-white text-[11px] font-semibold rounded ${product.isActive ? 'bg-emerald-700' : 'bg-neutral-500'}`}>
                {product.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <span className={`px-2.5 py-1 text-white text-[11px] font-semibold rounded ${product.isVisible ? 'bg-security-600' : 'bg-neutral-600'}`}>
                {product.isVisible ? 'Visible' : 'Oculto'}
              </span>
              <span className={`px-2.5 py-1 text-white text-[11px] font-semibold rounded ${effectiveStatusBadgeClass}`}>
                {LIFECYCLE_STATUS_LABEL[effectiveStatus]}
              </span>
            </div>

            {gallery.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {gallery.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(i)}
                    className={`w-8 h-8 rounded overflow-hidden border-2 transition-all ${
                      i === selectedImage
                        ? 'border-security-600'
                        : 'border-white hover:border-neutral-300'
                    }`}
                  >
                    <img
                      src={resolveAssetUrl(img.url)}
                      alt={`${product.name} #${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:w-1/2 xl:w-3/5 p-6">
            <p className="text-[11px] font-semibold text-security-600 uppercase tracking-wide">
              {product.brand?.name || 'Sin marca'}
            </p>
            <h1 className="text-xl font-bold text-neutral-800 mt-1">
              {product.name}
            </h1>
            <p className="text-xs text-neutral-400 font-mono mt-1">
              {product.sku}
            </p>

            {priceWithIva !== undefined && (
              <p className="mt-3 text-2xl font-bold text-security-700 tabular-nums">
                $ {formatCurrency(priceWithIva, 'COP')}
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-neutral-100 text-xs text-neutral-500 space-y-1">
              <div className="flex justify-between">
                <span>Categoría</span>
                <span className="text-neutral-700 font-medium">
                  {product.category?.name || 'Sin categoría'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Creado</span>
                <span>{formatDate(product.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Actualizado</span>
                <span>{formatDate(product.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-neutral-200 rounded-xl bg-white">
        <div className="px-6 pt-4 border-b border-neutral-200 flex gap-1 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (
                  t.id !== effectiveTab &&
                  effectiveTab === 'ficha' &&
                  fichaDirty &&
                  !window.confirm('Hay cambios sin guardar en la ficha. ¿Salir de esta pestaña y descartarlos?')
                ) {
                  return
                }
                setTab(t.id)
              }}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${
                effectiveTab === t.id
                  ? 'border-security-600 text-security-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {effectiveTab === 'ficha' && (
            <div className="space-y-6">
              {/* CAT-05: un solo motor — el informe vive en la revisión de trabajo. */}
              {isPublicationMode && <section className="border border-neutral-200 rounded-xl p-5 space-y-4" aria-label="Validación de la ficha">
                <div>
                  <h3 className="text-base font-semibold text-neutral-800">Validación</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Reglas compartidas del catálogo sobre la revisión de trabajo. Editar la ficha deja el resultado obsoleto; publicar corresponde a su propio flujo.
                  </p>
                </div>
                <ValidationSection productId={product.id} canEditSheet={false} />
              </section>}
              <ProductFichaTab
                product={product}
                categories={categories}
                brands={brands}
                isContextual={isContextual}
                canEditSheet={canEdit}
                onDirtyChange={setFichaDirty}
              />
            </div>
          )}
          {effectiveTab === 'prices' && !isPublicationMode && <ProductPricesSection product={product} mode="readOnly" />}
          {effectiveTab === 'publish' && (
            <div className="space-y-6">
              <PublishTab
                product={product}
                allowed={detailAllowed}
                canPublish={canPublish}
                canWrite={false}
                pending={transition.isPending}
                error={transition.error}
                onDirect={(event) => runTransition({ event })}
                onOpenAction={(event) => setLifecycleModal({ event: event as LifecycleModalEvent })}
                onDelete={handleDeleteOpen}
                scheduleActive={scheduleActive}
                scheduledAt={scheduledAt}
                onSchedule={openSchedule}
                onReprogram={openReprogram}
                onCancelSchedule={openCancelSchedule}
              />
              {/* CAT-06 frontend: qué revisión exacta se publicó/programó y cada bloqueo (solo lectura del contrato de servidor). */}
              <ProductPublicationSection productId={product.id} />
            </div>
          )}
        </div>
      </div>

      {scheduleModal && (
        <SchedulePublishModal
          open
          initialValue={scheduleModal.isReprogram && product.publishAt ? toDatetimeLocal(product.publishAt) : ''}
          isReprogram={scheduleModal.isReprogram}
          loading={scheduleMutation.isPending}
          error={scheduleMutation.error}
          onClose={() => {
            if (!scheduleMutation.isPending) setScheduleModal(null)
          }}
          onConfirm={(iso) => scheduleMutation.mutate(iso)}
        />
      )}

      {cancelScheduleOpen && (
        <CancelScheduleModal
          open
          loading={cancelScheduleMutation.isPending}
          error={cancelScheduleMutation.error}
          onClose={() => {
            if (!cancelScheduleMutation.isPending) setCancelScheduleOpen(false)
          }}
          onConfirm={confirmCancelSchedule}
        />
      )}

      {lifecycleModal && (
        <LifecycleConfirmModal
          event={lifecycleModal.event}
          loading={transition.isPending}
          error={transition.error}
          onClose={() => setLifecycleModal(null)}
          onConfirm={(reason) =>
            runTransition({
              event: lifecycleModal.event,
              ...(reason ? { reason } : {}),
              ...(lifecycleModal.event === 'ARCHIVE' || lifecycleModal.event === 'RESTORE'
                ? { confirm: true }
                : {}),
            })
          }
        />
      )}

      {deleteOpen && (
        <DeleteProductModal
          loading={deleteMutation.isPending}
          error={deleteMutation.error}
          onClose={() => setDeleteOpen(false)}
          onConfirm={(opts) => deleteMutation.mutate(opts)}
        />
      )}
    </div>
  )
}
