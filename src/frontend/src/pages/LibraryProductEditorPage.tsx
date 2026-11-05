import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { deleteProduct } from '../services/product-detail.service'
import { useTransitionProduct } from '../features/products/hooks/useProductTransition'
import { ProductInternalNotes } from '../features/products/sheet/ProductInternalNotes'
import { usePanelAccess } from '../features/users/access'
import { Alert, Badge, Button, Card, Modal } from '../components/ui'
import { getApiErrorMessage } from '../lib/apiError'
import { useHasPermission } from '../lib/rbac'
import type { Brand, Category, Product } from '../features/products/types/product.types'
import { LIFECYCLE_STATUS_LABEL, effectiveLifecycleStatus, hasActiveScheduling } from '../features/products/lib/lifecycle'
import {
  LIBRARY_QUEUE_PATH,
  PRODUCTS_LIST_PATH,
  sheetEditorReturnPath,
} from '../features/products/lib/library-nav'
import {
  buildUpdatePayload,
  changedFields,
  validateEditorValues,
  valuesOfProduct,
  type EditorField,
  type EditorValues,
} from '../features/products/lib/sheet-dirty'
import { SpecEditor, type SpecField } from '../features/products/components/SpecEditor'
import { fieldFromElement, previewField } from '../features/products/preview/preview-fields'
import { FIELD_SECTION, SECTION_DEFAULT_FIELD, type PreviewField } from '../features/products/preview/preview-model'
import { focusFieldZone } from '../features/products/preview/focus-field'
import { LivePreviewPanel } from '../features/products/preview/LivePreviewPanel'
import { useStageWide } from '../features/products/preview/use-stage-wide'
import { ProductPhotosSection } from '../features/products/sheet/ProductPhotosSection'
import { PDF_OPTIONAL_NOTICE } from '../features/products/sheet/document-assets'
import { ClassificationSection } from '../features/products/classification/ClassificationSection'
import { KeySpecsSection } from '../features/products/key-specs/KeySpecsSection'
import { keySpecKeys } from '../features/products/api/keySpecsApi'
import { useClassificationTree, useKeySpecProjection } from '../features/products/hooks/useKeySpecs'
import { classificationErrorMessage } from '../features/products/lib/classification'
import { draftKeySpecItems } from '../features/products/lib/key-specs'
import { ProductSheetScope, SheetSlot } from '../features/products/sheet/ProductSheetTab'
import { useSheetDraft } from '../features/products/sheet/SheetDraftContext'
import { BadgesBlock } from '../features/products/sheet/blocks/BadgesBlock'
import { FeaturesBlock } from '../features/products/sheet/blocks/FeaturesBlock'
import { HighlightsBlock } from '../features/products/sheet/blocks/HighlightsBlock'
import { IdentifiersBlock } from '../features/products/sheet/blocks/IdentifiersBlock'
import { ResourcesBlock } from '../features/products/sheet/blocks/ResourcesBlock'
import { EditorSaveBar } from '../features/products/sheet/blocks/EditorSaveBar'
import { SpecGroupsBlock } from '../features/products/sheet/blocks/SpecGroupsBlock'
import { StatusBlock } from '../features/products/sheet/blocks/StatusBlock'
import { WebAddressBlock } from '../features/products/sheet/blocks/WebAddressBlock'
import { disclosureSummaryClass } from '../features/products/sheet/blocks/sheet-fields'
import { ProductAuditTab } from '../features/products/audit/ProductAuditTab'
import { ProductPricesSection } from '../features/products/prices/ProductPricesSection'
import { LibraryPublicationSection } from '../features/catalog-publication/LibraryPublicationSection'
import './LibraryProductEditorPage.css'

const LEAVE_PROMPT = 'Hay cambios sin guardar. ¿Salir y descartarlos?'

const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm disabled:bg-neutral-50 disabled:text-neutral-500'
const labelClass = 'block text-sm font-medium text-neutral-700 mb-1.5'

/** True when the simple list has at least one row with a key or a value. Empty rows do not count. */
const hasSpecValues = (fields: SpecField[]) => fields.some((field) => field.key.trim() !== '' || String(field.value).trim() !== '')
const hintClass = 'text-xs text-neutral-500 mt-1'

/** The flat index of the editor, in reading order. */
const SECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'datos-generales', label: 'Datos generales' },
  { id: 'datos-clave', label: 'Datos clave' },
  { id: 'imagenes', label: 'Imágenes' },
  { id: 'resumen', label: 'Resumen para el cliente' },
  { id: 'descripcion', label: 'Descripción y especificaciones' },
  { id: 'precios', label: 'Precios' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'publicacion', label: 'Publicar' },
  { id: 'acciones', label: 'Archivar o quitar' },
  { id: 'notas-internas', label: 'Notas internas' },
  { id: 'historial', label: 'Historial' },
]

/** Sections that only editors see (their blocks are part of the sheet). */
const EDITOR_ONLY_SECTIONS = new Set(['resumen', 'recursos'])

/** Sections whose content lives partly in the sheet: a pending sheet edit marks them. Photos save on their own. */
const SHEET_SECTION_IDS = new Set(['datos-generales', 'descripcion', 'resumen', 'recursos', 'publicacion'])

/**
 * Anchors of earlier versions of the editor, by their old name (#seccion-X and #ficha-X), and the section
 * that now holds their content.
 */
const LEGACY_FICHA_HASHES: Record<string, string> = {
  'ficha-publica': 'datos-generales',
  'ficha-identidad': 'datos-generales',
  'ficha-modelos': 'datos-generales',
  etiquetas: 'resumen',
  destacados: 'resumen',
  caracteristicas: 'resumen',
  'ficha-destacados': 'resumen',
  'ficha-caracteristicas': 'resumen',
  'ficha-especificaciones': 'descripcion',
  'ficha-notas': 'descripcion',
  'ficha-documentos': 'recursos',
}

/** Old anchors (#ficha-… or #seccion-ficha-…) point to the section that now holds their content. */
function resolveSectionHash(rawHash: string): string {
  const target = LEGACY_FICHA_HASHES[rawHash.replace(/^#(seccion-)?/, '')]
  return target ? `#seccion-${target}` : rawHash
}

const httpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status

/** Server message, with a plain-language text for the generic 403 of the role guard. */
function actionErrorMessage(error: unknown, fallback: string): string {
  const classification = classificationErrorMessage(error)
  if (classification) return classification
  const message = getApiErrorMessage(error, '')
  if (httpStatus(error) === 403 && (!message || /forbidden/i.test(message))) {
    return 'Tu asignación de Biblioteca no permite esta acción.'
  }
  return message || fallback
}

function formatSchedule(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

// eslint-disable-next-line react-refresh/only-export-components
export function isPublicationEditingDisabled(hasUnsavedChanges: boolean, isSaving: boolean): boolean {
  return hasUnsavedChanges || isSaving
}

/** Keeps the saved value selectable while the option lists are still loading. */
function withCurrent<T extends { id: string; name: string }>(options: T[], id: string, fallbackName?: string) {
  if (!id || options.some((option) => option.id === id)) return options
  return [{ id, name: fallbackName ?? 'Valor actual' }, ...options]
}

function EditorSection({ id, title, note, active = true, children }: { id: string; title: string; note?: string; active?: boolean; children: ReactNode }) {
  return (
    <section
      id={`seccion-${id}`}
      hidden={!active}
      aria-labelledby={`seccion-${id}-title`}
      className="biblioteca-editor__panel space-y-4"
    >
      <div>
        <h3 id={`seccion-${id}-title`} className="text-base font-semibold text-neutral-800">
          {title}
        </h3>
        {note && <p className="text-xs text-neutral-500 mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function ReadOnlyItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-neutral-800">{value}</dd>
    </div>
  )
}

// ------------------------------ Bloques de la ficha pública ------------------------------

/** The sheet blocks of one section. They lock while the internal notes have unsaved text. */
function SheetPart({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <SheetSlot>
      {locked && <p role="status" className="text-sm text-amber-700">Guarda o descarta las notas internas antes de editar la ficha pública.</p>}
      <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {children}
      </fieldset>
    </SheetSlot>
  )
}

/** A subtitle (h3) under a divider, inside a section. */
function SheetSubsection({ title, hint, field, children }: { title: string; hint?: string; field?: PreviewField; children: ReactNode }) {
  return (
    <div className="space-y-4 border-t border-neutral-200 pt-6" {...(field ? previewField(field) : {})}>
      <div>
        <h3 className="text-base font-semibold text-neutral-800">{title}</h3>
        {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Manufacturer codes: internal use only, closed unless one of them already has a value. */
function IdentifiersDisclosure() {
  const { form } = useSheetDraft()
  return (
    <details className="border-t border-neutral-200 pt-6" open={form.manufacturerRefs.some((row) => row.value.trim() !== '')}>
      <summary className={disclosureSummaryClass}>Códigos del fabricante (solo uso interno)</summary>
      <div className="mt-4 space-y-2">
        <p className={hintClass}>El cliente no los ve en la tienda.</p>
        <IdentifiersBlock showTitle={false} />
      </div>
    </details>
  )
}

/** Web address (slug) of the product: advanced, closed unless it already has a value. */
function WebAddressDisclosure() {
  const { form } = useSheetDraft()
  return (
    <details className="border-t border-neutral-200 pt-6" open={Boolean(form.slug.trim()) || form.published}>
      <summary className={disclosureSummaryClass}>Dirección web (avanzado)</summary>
      <div className="mt-4">
        <WebAddressBlock />
      </div>
    </details>
  )
}

// ------------------------------ Quitar producto ------------------------------

function RemoveProductModal({ product, onClose, onRemoved }: { product: Product; onClose: () => void; onRemoved: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [clave, setClave] = useState('')
  const [localError, setLocalError] = useState('')

  const remove = useMutation({
    mutationFn: () => deleteProduct(product.id, clave.trim() ? { clave: clave.trim() } : undefined),
    onSuccess: onRemoved,
  })

  const code = (remove.error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code
  const needsClave = code === 'CLAVE_USUARIO_REQUERIDA' || code === 'CLAVE_USUARIO_INCORRECTA'
  const alertMessage = localError || (remove.error ? actionErrorMessage(remove.error, 'No se pudo quitar el producto.') : '')

  const confirm = () => {
    if (!confirmed) {
      setLocalError('Confirma que entiendes que no se puede deshacer.')
      return
    }
    if (needsClave && !clave.trim()) {
      setLocalError('La clave del usuario es obligatoria para quitar este producto.')
      return
    }
    setLocalError('')
    remove.mutate()
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!remove.isPending) onClose()
      }}
      title="Quitar producto"
      footer={
        <>
          <Button variant="secondary" disabled={remove.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={confirm}>
            {needsClave ? 'Quitar con clave' : 'Quitar producto'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {alertMessage && <Alert variant="error">{alertMessage}</Alert>}
        <p className="text-sm text-neutral-600">
          Se elimina «{product.name}» ({product.sku}) definitivamente, con sus precios e imágenes. <strong>No se puede deshacer.</strong>
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 w-4 h-4 text-[var(--color-primary)] border-neutral-300 rounded focus:ring-[var(--color-primary-focus-ring)]"
          />
          <span className="text-sm text-neutral-700">Confirmo que entiendo el alcance de esta acción.</span>
        </label>
        {needsClave && (
          <div>
            <label className={labelClass} htmlFor="editor-remove-clave">
              Clave del usuario
            </label>
            <input
              id="editor-remove-clave"
              type="password"
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
            />
            <p className={hintClass}>
              {code === 'CLAVE_USUARIO_INCORRECTA' ? 'Clave incorrecta. Inténtalo de nuevo.' : 'Ingresa tu clave para confirmar.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------ Editor ------------------------------

interface ProductEditorProps {
  product: Product
  categories: Category[]
  brands: Brand[]
  returnTo: string
}

function ProductEditor({ product, brands, returnTo }: ProductEditorProps) {
  const navigate = useNavigate()
  const editorLocation = useLocation()
  const queryClient = useQueryClient()
  const canEdit = useHasPermission('products:write')
  const canDelete = useHasPermission('products:delete')
  const canReadNotes = useHasPermission('products:notes')
  const libraryAccess = usePanelAccess('catalog')
  const canPublish = useHasPermission('products:publish')
  const canReadProducts = libraryAccess.tabs.some((tab) => tab.to === PRODUCTS_LIST_PATH)
  const safeReturnTo = !canReadProducts && returnTo.startsWith(PRODUCTS_LIST_PATH) ? LIBRARY_QUEUE_PATH : returnTo
  const editorRoot = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const wide = useStageWide(stageRef)
  const visibleSections = useMemo(() => SECTIONS.filter((section) =>
    (section.id !== 'notas-internas' || canEdit && canReadNotes) &&
    (!EDITOR_ONLY_SECTIONS.has(section.id) || canEdit)
  ).map((section) => section.id === 'publicacion' && !canPublish ? { ...section, label: 'Estado de publicación' } : section), [canEdit, canReadNotes, canPublish])
  const sectionForHash = useCallback((rawHash: string) => {
    const hash = resolveSectionHash(rawHash)
    return visibleSections.find((section) => `#seccion-${section.id}` === hash)?.id ?? visibleSections[0]?.id ?? 'datos-generales'
  }, [visibleSections])

  const baseline = useMemo(() => valuesOfProduct(product), [product])
  // Only what the user touched; everything else follows the product the server returns.
  const [edits, setEdits] = useState<Partial<EditorValues>>({})
  const [resetKey, setResetKey] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  const [sheetDirty, setSheetDirty] = useState(false)
  const [notesDirty, setNotesDirty] = useState(false)
  const [keySpecsDirty, setKeySpecsDirty] = useState(false)
  const classificationTree = useClassificationTree()
  // The preview shows the draft projection; the published sheet is never touched by previewing.
  const keySpecProjection = useKeySpecProjection(product.id, canEdit)
  const previewKeySpecItems = useMemo(() => draftKeySpecItems(keySpecProjection.data), [keySpecProjection.data])
  const [activeSection, setActiveSection] = useState(() => sectionForHash(editorLocation.hash))
  const [lifecycleAction, setLifecycleAction] = useState<'ARCHIVE' | 'RESTORE' | null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleConfirmed, setLifecycleConfirmed] = useState(false)
  const transition = useTransitionProduct(product.id)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [activeField, setActiveField] = useState<PreviewField | null>(null)
  const [view, setView] = useState<'editar' | 'vista'>('editar')

  const current: EditorValues = { ...baseline, ...edits }
  const changed = changedFields(baseline, current)
  const dirtyCount = changed.length
  const hasUnsaved = dirtyCount > 0 || sheetDirty || notesDirty || keySpecsDirty

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put(`/products/${product.id}`, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product', product.id] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['product-audit', product.id] }),
        queryClient.invalidateQueries({ queryKey: keySpecKeys.all(product.id) }),
      ])
      setEdits({})
      setResetKey((key) => key + 1)
    },
  })

  const isDirty = hasUnsaved
  function chooseSection(id: string) {
    const next = visibleSections.some((section) => section.id === id) ? id : visibleSections[0]?.id ?? 'datos-generales'
    setActiveSection(next)
    if (next !== activeSection) {
      navigate(
        { pathname: editorLocation.pathname, search: editorLocation.search, hash: `#seccion-${next}` },
        { state: editorLocation.state },
      )
    }
  }

  /** Opens the section that fixes a publication requirement, then moves the view and focus there. */
  function goToPublicationFix(sectionId: string) {
    chooseSection(sectionId)
    requestAnimationFrame(() => {
      const panel = document.getElementById(`seccion-${sectionId}`)
      panel?.scrollIntoView?.({ block: 'start' })
      panel?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    const next = sectionForHash(editorLocation.hash)
    setActiveSection(next)
    if (editorLocation.hash !== `#seccion-${next}`) {
      navigate(
        { pathname: editorLocation.pathname, search: editorLocation.search, hash: `#seccion-${next}` },
        { replace: true, state: editorLocation.state },
      )
    }
  }, [canEdit, canReadNotes, editorLocation.hash, editorLocation.pathname, editorLocation.search, editorLocation.state, navigate, sectionForHash])

  /**
   * Focus inside the editor highlights the field it belongs to. A control in a section without a zone clears the
   * highlight; focus outside every section (the save bar) keeps the last one, so the preview does not jump.
   */
  function trackFocus(event: ReactFocusEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const field = fieldFromElement(target)
    if (field !== null) setActiveField(field)
    else if (target.closest('.biblioteca-editor__panel')) setActiveField(null)
  }

  /** Index navigation: always shows the editor view, which on narrow screens replaces the preview. */
  function pickSection(id: string) {
    setView('editar')
    chooseSection(id)
  }

  /** A click on the preview: opens the section that holds the field, then focuses it once the panel is visible. */
  function selectPreviewField(field: PreviewField) {
    if (field === 'internal') return
    setView('editar')
    chooseSection(FIELD_SECTION[field])
    setActiveField(field)
    requestAnimationFrame(() => requestAnimationFrame(() => focusFieldZone(document, field)))
  }

  // Switching sections highlights that section's default preview field; a field already in it stays.
  useEffect(() => {
    setActiveField((field) => (field !== null && FIELD_SECTION[field] === activeSection ? field : SECTION_DEFAULT_FIELD[activeSection] ?? null))
  }, [activeSection])

  useEffect(() => {
    if (!formError || typeof document === 'undefined') return
    const focus = () => {
      const panel = document.getElementById(`seccion-${activeSection}`)
      const target = panel?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')
      target?.focus()
    }
    requestAnimationFrame(focus)
  }, [activeSection, formError])

  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const guardExternalEditorNavigation = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!anchor || editorRoot.current?.contains(anchor)) return
      if (!window.confirm(LEAVE_PROMPT)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', guardExternalEditorNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', guardExternalEditorNavigation, true)
    }
  }, [isDirty])

  const setField = <K extends EditorField>(field: K, value: EditorValues[K]) => {
    setEdits((prev) => ({ ...prev, [field]: value }))
    setFormError(null)
    if (!save.isPending) save.reset()
  }

  const discard = () => {
    setEdits({})
    setResetKey((key) => key + 1)
    setFormError(null)
    save.reset()
  }

  /** Saves the general data. Resolves true when saved; a validation problem is shown and stops the save. */
  const saveDatos = async (): Promise<boolean> => {
    const problem = validateEditorValues(current, changed)
    if (problem) {
      setFormError(problem)
      const target = changed.some((field) => field === 'name' || field === 'brandId' || field === 'categoryId' || field === 'subcategoryId')
        ? 'datos-generales'
        : 'descripcion'
      chooseSection(target)
      return false
    }
    setFormError(null)
    try {
      await save.mutateAsync(buildUpdatePayload(current, changed))
      return true
    } catch {
      return false
    }
  }

  const confirmLeave = () => !hasUnsaved || window.confirm(LEAVE_PROMPT)
  const guardLink = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!confirmLeave()) event.preventDefault()
  }

  const status = effectiveLifecycleStatus(product)
  const scheduledPublish = hasActiveScheduling(product) && product.publishAt ? product.publishAt : null

  /** Whether a section has edits that are not saved yet (page fields, sheet or internal notes). */
  const sectionDirty = (id: string) => {
    if (id === 'notas-internas') return notesDirty
    if (id === 'datos-clave') return keySpecsDirty
    const pageFields = id === 'datos-generales'
      ? ['name', 'brandId', 'categoryId', 'subcategoryId']
      : id === 'descripcion' ? ['description', 'technicalSpecs', 'extraAttributes'] : []
    return (SHEET_SECTION_IDS.has(id) && sheetDirty) || changed.some((field) => pageFields.includes(field))
  }

  // The sheet blocks need its draft: the sections that hold them mount inside the sheet scope (editors only).
  const sheetScope = (children: ReactNode) => canEdit
    ? <ProductSheetScope productId={product.id} lifecycleStatus={product.lifecycleStatus ?? null} onDirtyChange={setSheetDirty}>{children}</ProductSheetScope>
    : children

  const crumbs = [
    ...(canReadProducts ? [{ to: PRODUCTS_LIST_PATH, label: 'Biblioteca' }] : []),
    { to: LIBRARY_QUEUE_PATH, label: 'Fichas de producto' },
  ]

  return (
    <div ref={editorRoot} className="biblioteca-editor space-y-6">
      <header className="space-y-3">
        <nav aria-label="Ruta de navegación">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
            {crumbs.map((crumb) => (
              <li key={crumb.to} className="flex items-center gap-1.5">
                <Link to={crumb.to} onClick={guardLink} className="hover:text-security-600">
                  {crumb.label}
                </Link>
                <span aria-hidden="true">›</span>
              </li>
            ))}
            <li aria-current="page" className="font-mono text-neutral-700">
              {product.sku}
            </li>
          </ol>
        </nav>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Button variant="secondary" className="self-start" onClick={() => confirmLeave() && navigate(safeReturnTo)}>
            Volver
          </Button>
          <div className="min-w-0 sm:text-right">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <h2 className="biblioteca-editor__title break-words">{product.name}</h2>
              <Badge variant={status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral'}>
                <span data-testid="editor-status-badge">{LIFECYCLE_STATUS_LABEL[status]}</span>
              </Badge>
            </div>
            <p className="mt-1 text-sm text-neutral-600">{product.sku} · {product.brand?.name || 'Sin marca'}</p>
            <p className="mt-1 text-xs text-neutral-600">Fotos y precios se guardan al instante. Las notas internas tienen su propio guardado.</p>
          </div>
        </div>
      </header>

      {sheetScope(
        <div
          ref={stageRef}
          data-wide={wide ? 'true' : 'false'}
          className={`biblioteca-editor__stage${canEdit ? ' biblioteca-editor__stage--preview' : ''}`}
        >
          {canEdit && (
            <div className="biblioteca-editor__view-toggle" role="group" aria-label="Qué quieres ver">
              <button type="button" aria-pressed={view === 'editar'} onClick={() => setView('editar')}>Editar</button>
              <button type="button" aria-pressed={view === 'vista'} onClick={() => setView('vista')}>Vista previa</button>
            </div>
          )}
          <div className={`biblioteca-editor__layout${canEdit ? ' biblioteca-editor__layout--preview' : ''}`} data-view={view}>
            <nav aria-label="Secciones de la ficha" className="biblioteca-editor__index">
              <label className="biblioteca-editor__mobile-index">
                <span>Sección</span>
                <select value={activeSection} onChange={(event) => pickSection(event.target.value)} aria-label="Sección de la ficha">
                  {visibleSections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                </select>
              </label>
              <div className="biblioteca-editor__desktop-index" role="group" aria-label="Ir a una sección">
                {visibleSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    aria-current={activeSection === section.id ? 'page' : undefined}
                    aria-controls={`seccion-${section.id}`}
                    onClick={() => pickSection(section.id)}
                  >
                    {section.label}
                    {sectionDirty(section.id) && <span className="biblioteca-editor__pending-marker">Sin guardar</span>}
                  </button>
                ))}
              </div>
              {status === 'PUBLISHED' && product.isVisible && <Link className="biblioteca-editor__public-link" to={`/catalogo/productos/${product.id}`} onClick={guardLink}>Ver ficha publicada</Link>}
            </nav>

            <main
              className="biblioteca-editor__content"
              onFocusCapture={trackFocus}
            >
              <EditorSection id="datos-generales" active={activeSection === 'datos-generales'} title="Datos generales">
                <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
                  <div {...previewField('name')}>
                    <label className={labelClass} htmlFor="editor-name">
                      Nombre del producto
                    </label>
                    <input
                      id="editor-name"
                      type="text"
                      value={current.name}
                      onChange={(event) => setField('name', event.target.value)}
                      className={inputClass}
                    />
                    <p className={hintClass}>
                      Es el nombre que ve el cliente en la tienda.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div {...previewField('sku')}>
                      <span className={labelClass}>Referencia (SKU)</span>
                      <p className="rounded-lg bg-neutral-50 px-3 py-2.5 font-mono text-sm text-neutral-700" data-testid="sku-readonly">
                        {product.sku}
                      </p>
                      <p className={hintClass}>Solo lectura.</p>
                    </div>
                    <div {...previewField('brand')}>
                      <label className={labelClass} htmlFor="editor-brand">
                        Marca
                      </label>
                      <select
                        id="editor-brand"
                        value={current.brandId}
                        onChange={(event) => setField('brandId', event.target.value)}
                        className={inputClass}
                      >
                        <option value="">Sin marca todavía</option>
                        {withCurrent(brands, current.brandId, product.brand?.name).map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div {...previewField('category')}>
                    <ClassificationSection
                      productId={product.id}
                      tree={classificationTree.data}
                      loading={classificationTree.isLoading}
                      failed={classificationTree.isError}
                      savedSubcategoryId={baseline.subcategoryId}
                      subcategoryId={current.subcategoryId}
                      brandId={current.brandId}
                      fallbackRootName={product.category?.name}
                      fallbackSubcategoryName={product.subcategory?.name}
                      disabled={!canEdit}
                      onChange={(subcategoryId) => setField('subcategoryId', subcategoryId)}
                    />
                  </div>
                </fieldset>
                {canEdit && (
                  <SheetPart locked={notesDirty}>
                    <div {...previewField('status')}>
                      <StatusBlock />
                    </div>
                    <div {...previewField('internal')}>
                      <IdentifiersDisclosure />
                    </div>
                  </SheetPart>
                )}
              </EditorSection>

              <EditorSection
                id="datos-clave"
                active={activeSection === 'datos-clave'}
                title="Datos clave"
                note="Los datos principales que pide la subcategoría. Se guardan con su propio botón."
              >
                <KeySpecsSection
                  productId={product.id}
                  savedSubcategoryId={baseline.subcategoryId}
                  subcategoryUnsaved={current.subcategoryId !== baseline.subcategoryId}
                  canEdit={canEdit}
                  onDirtyChange={setKeySpecsDirty}
                />
              </EditorSection>

              <EditorSection id="imagenes" active={activeSection === 'imagenes'} title="Imágenes">
                <div {...previewField('images')}>
                  <ProductPhotosSection product={product} />
                </div>
              </EditorSection>

              {canEdit && (
                <EditorSection id="resumen" active={activeSection === 'resumen'} title="Resumen para el cliente">
                  <SheetPart locked={notesDirty}>
                    <SheetSubsection title="Etiquetas" hint="Etiqueta pequeña junto al código del producto, por ejemplo «Destacado»." field="badges">
                      <BadgesBlock showTitle={false} showHint={false} />
                    </SheetSubsection>
                    <SheetSubsection title="Destacados" hint="Lista con viñetas bajo el nombre. Escribe los beneficios principales." field="highlights">
                      <HighlightsBlock />
                    </SheetSubsection>
                    <SheetSubsection title="Características" hint="Íconos con texto bajo los botones, por ejemplo «eSSD 1 TB». Es un resumen rápido; la tabla técnica va en Especificaciones." field="features">
                      <FeaturesBlock />
                    </SheetSubsection>
                  </SheetPart>
                </EditorSection>
              )}

              <EditorSection
                id="descripcion"
                active={activeSection === 'descripcion'}
                title="Descripción y especificaciones"
              >
                <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
                  <div {...previewField('description')}>
                    <h3 className="mb-1.5 text-base font-semibold text-neutral-800">
                      <label htmlFor="editor-description">Descripción</label>
                    </h3>
                    <p className={`${hintClass} mb-1.5`}>Se muestra bajo el nombre solo si el producto no tiene destacados.</p>
                    <textarea
                      id="editor-description"
                      rows={4}
                      value={current.description}
                      onChange={(event) => setField('description', event.target.value)}
                      className={`${inputClass} resize-y`}
                    />
                  </div>
                </fieldset>
                {canEdit && (
                  <SheetPart locked={notesDirty}>
                    <SheetSlot>
                      <SheetSubsection title="Especificaciones" hint="Un grupo por tema, por ejemplo Video o Red. Elige un grupo para editar sus filas." field="specs">
                        <SpecGroupsBlock />
                      </SheetSubsection>
                    </SheetSlot>
                  </SheetPart>
                )}
                {(hasSpecValues(current.technicalSpecs) || hasSpecValues(current.extraAttributes)) && (
                  <div className="border-t border-neutral-200 pt-6" {...previewField('specs')}>
                    <details>
                      <summary className={disclosureSummaryClass}>Lista simple anterior</summary>
                      <fieldset disabled={!canEdit} className="mt-4 m-0 min-w-0 border-0 p-0">
                        <p className="mb-4 text-xs text-neutral-500">
                          La tienda muestra esta lista solo cuando el producto no tiene grupos de especificaciones. Para productos nuevos usa la tabla de arriba.
                        </p>
                        <div key={`specs-${resetKey}`} className="space-y-6">
                          <SpecEditor
                            fields={current.technicalSpecs}
                            onChange={(fields) => setField('technicalSpecs', fields)}
                            label="Especificaciones técnicas"
                            placeholder="Agrega especificaciones como resolución, lente, visión nocturna, etc."
                          />
                          <SpecEditor
                            fields={current.extraAttributes}
                            onChange={(fields) => setField('extraAttributes', fields)}
                            label="Atributos extra"
                            placeholder="Agrega atributos como garantía, peso, color, etc."
                          />
                        </div>
                      </fieldset>
                    </details>
                  </div>
                )}
              </EditorSection>

              <EditorSection id="precios" active={activeSection === 'precios'} title="Precios" note="Los cambios de precios se guardan al instante y se registran en el historial.">
                <div {...previewField('price')}>
                  <ProductPricesSection product={product} mode="editable" />
                </div>
              </EditorSection>

              {canEdit && (
                <EditorSection
                  id="recursos"
                  active={activeSection === 'recursos'}
                  title="Recursos"
                  note={`Lo que el cliente puede descargar. ${PDF_OPTIONAL_NOTICE}`}
                >
                  <SheetPart locked={notesDirty}>
                    <div {...previewField('resources')}>
                      <ResourcesBlock />
                    </div>
                  </SheetPart>
                </EditorSection>
              )}

              <EditorSection id="publicacion" active={activeSection === 'publicacion'} title={canPublish ? 'Publicar' : 'Estado de publicación'}>
                {canPublish ? (
                  <LibraryPublicationSection
                    product={product}
                    disabled={isPublicationEditingDisabled(hasUnsaved, save.isPending)}
                    onGoToSection={canEdit ? goToPublicationFix : undefined}
                  />
                ) : (
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <ReadOnlyItem label="Estado" value={LIFECYCLE_STATUS_LABEL[status]} />
                    <ReadOnlyItem label="Visible en la tienda" value={product.isVisible ? 'Sí' : 'No'} />
                    <ReadOnlyItem label="Publicación programada" value={scheduledPublish ? formatSchedule(scheduledPublish) : 'Sin programar'} />
                    {product.unpublishAt && <ReadOnlyItem label="Despublicación programada" value={formatSchedule(product.unpublishAt)} />}
                  </dl>
                )}
                {canEdit && (
                  <SheetPart locked={notesDirty}>
                    <div {...previewField('internal')}>
                      <WebAddressDisclosure />
                    </div>
                  </SheetPart>
                )}
              </EditorSection>

              <EditorSection id="acciones" active={activeSection === 'acciones'} title="Archivar o quitar" note="Archiva para retirar un producto sin borrar su información.">
                {transition.isError && <Alert variant="error">{actionErrorMessage(transition.error, 'No se pudo cambiar el estado.')}</Alert>}
                {transition.isSuccess && <Alert variant="success">Estado del producto actualizado.</Alert>}
                {canEdit || canDelete ? (
                  <div className="flex flex-wrap gap-3">
                    {canEdit && <Button variant="secondary" disabled={hasUnsaved || transition.isPending || !(product.allowedActions ?? []).includes(status === 'ARCHIVED' ? 'RESTORE' : 'ARCHIVE')} onClick={() => {
                      setLifecycleAction(status === 'ARCHIVED' ? 'RESTORE' : 'ARCHIVE')
                      setLifecycleReason('')
                      setLifecycleConfirmed(false)
                      transition.reset()
                    }}>{status === 'ARCHIVED' ? 'Restaurar producto' : 'Archivar producto'}</Button>}
                    {canDelete && (
                      <Button variant="danger" onClick={() => setRemoveOpen(true)}>
                        Quitar producto
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">No tienes permisos para archivar ni quitar productos.</p>
                )}
              </EditorSection>

              {canEdit && canReadNotes && <EditorSection id="notas-internas" active={activeSection === 'notas-internas'} title="Notas internas">
                <ProductInternalNotes productId={product.id} blocked={sheetDirty} onDirtyChange={setNotesDirty} />
              </EditorSection>}

              <EditorSection id="historial" active={activeSection === 'historial'} title="Historial" note="Solo lectura: quién cambió qué y cuándo.">
                <ProductAuditTab productId={product.id} />
              </EditorSection>

              {/* The sheet has no name field of its own: a changed product name is copied to the store name. */}
              {canEdit && (
                <EditorSaveBar
                  datosDirty={dirtyCount > 0}
                  datosSaving={save.isPending}
                  datosError={formError || (save.isError ? actionErrorMessage(save.error, 'No se pudieron guardar los datos generales.') : null)}
                  onSaveDatos={saveDatos}
                  onDiscardDatos={discard}
                  syncName={changed.includes('name') ? current.name.trim() : undefined}
                />
              )}
            </main>

            {canEdit && (
              <div className="biblioteca-editor__preview">
                <LivePreviewPanel
                  product={product}
                  values={{
                    name: current.name,
                    brandName: brands.find((brand) => brand.id === current.brandId)?.name ?? product.brand?.name ?? '',
                    description: current.description,
                  }}
                  activeField={activeField}
                  activeSection={activeSection}
                  onSelectField={selectPreviewField}
                  keySpecItems={previewKeySpecItems}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {removeOpen && (
        <RemoveProductModal
          product={product}
          onClose={() => setRemoveOpen(false)}
          onRemoved={() => {
            void queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'all' })
            navigate(safeReturnTo)
          }}
        />
      )}
      {lifecycleAction && <Modal open title={lifecycleAction === 'ARCHIVE' ? 'Archivar producto' : 'Restaurar producto'} onClose={() => { if (!transition.isPending) setLifecycleAction(null) }} footer={<>
        <Button variant="secondary" disabled={transition.isPending} onClick={() => setLifecycleAction(null)}>Cancelar</Button>
        <Button disabled={!lifecycleReason.trim() || !lifecycleConfirmed} loading={transition.isPending} onClick={() => transition.mutate({ event: lifecycleAction, reason: lifecycleReason.trim(), confirm: true }, { onSuccess: () => {
          setLifecycleAction(null)
          void queryClient.invalidateQueries({ queryKey: ['product-audit', product.id] })
        } })}>{lifecycleAction === 'ARCHIVE' ? 'Confirmar archivo' : 'Confirmar restauración'}</Button>
      </>}>
        <div className="space-y-3">
          <p>{lifecycleAction === 'ARCHIVE' ? 'El producto dejará de estar disponible comercialmente; se conservará su información.' : 'El producto volverá a borrador. Para mostrarlo en la tienda deberá publicarse después.'}</p>
          {transition.isError && <Alert variant="error">{actionErrorMessage(transition.error, 'No se pudo cambiar el estado.')}</Alert>}
          <label className="block text-sm">Motivo<textarea className={inputClass} value={lifecycleReason} maxLength={1000} onChange={(event) => setLifecycleReason(event.target.value)} /></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={lifecycleConfirmed} onChange={(event) => setLifecycleConfirmed(event.target.checked)} />Confirmo esta acción sobre {product.sku}.</label>
        </div>
      </Modal>}
    </div>
  )
}

// ------------------------------ Página ------------------------------

const backLinkClass = 'text-sm text-security-600 hover:text-security-700'

export function EditorNotFound() {
  return (
    <div className="space-y-4">
      <Link to={LIBRARY_QUEUE_PATH} className={backLinkClass}>
        ← Volver a Fichas de producto
      </Link>
      <Card className="py-10 text-center">
        <p className="font-medium text-neutral-700">No encontramos este producto</p>
        <p className="mt-1 text-sm text-neutral-500">Puede que se haya quitado o que el enlace no sea correcto.</p>
      </Card>
    </div>
  )
}

export function EditorLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-4">
      <Link to={LIBRARY_QUEUE_PATH} className={backLinkClass}>
        ← Volver a Fichas de producto
      </Link>
      <Alert variant="error">{getApiErrorMessage(error, 'No se pudo cargar el producto.')}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

export default function LibraryProductEditorPage() {
  const { productId = '' } = useParams<{ productId: string }>()
  const location = useLocation()
  const returnTo = sheetEditorReturnPath(location.state)

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => (await api.get(`/products/${productId}`)).data as Product,
    enabled: Boolean(productId),
    retry: (failureCount, error) => httpStatus(error) !== 404 && failureCount < 1,
  })
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data.data as Category[],
  })
  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: async () => (await api.get('/brands')).data.data as Brand[],
  })

  if (productQuery.isLoading) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Cargando producto…</span>
        <div className="h-5 w-1/3 animate-pulse rounded bg-neutral-100" />
        <div className="h-8 w-1/2 animate-pulse rounded bg-neutral-100" />
        <div className="h-64 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    )
  }

  if (productQuery.error && httpStatus(productQuery.error) !== 404) {
    return <EditorLoadError error={productQuery.error} onRetry={() => void productQuery.refetch()} />
  }
  if (!productQuery.data) return <EditorNotFound />

  return (
    <ProductEditor
      key={productQuery.data.id}
      product={productQuery.data}
      categories={categoriesQuery.data ?? []}
      brands={brandsQuery.data ?? []}
      returnTo={returnTo}
    />
  )
}
