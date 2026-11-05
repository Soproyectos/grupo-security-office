import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Alert, Badge, Button, Card } from '../components/ui'
import { getApiErrorMessage } from '../lib/apiError'
import type { Brand, Product } from '../features/products/types/product.types'
import { LIBRARY_QUEUE_PATH, NEW_PRODUCT_PATH, sheetEditorPath } from '../features/products/lib/library-nav'
import {
  buildUpdatePayload,
  changedFields,
  validateEditorValues,
  valuesOfProduct,
  type EditorField,
  type EditorValues,
} from '../features/products/lib/sheet-dirty'
import { classificationErrorMessage } from '../features/products/lib/classification'
import { missingList } from '../features/products/lib/key-specs'
import { ClassificationSection } from '../features/products/classification/ClassificationSection'
import { KeySpecsSection } from '../features/products/key-specs/KeySpecsSection'
import { MissingKeySpecsPanel } from '../features/products/key-specs/MissingKeySpecsPanel'
import { keySpecKeys } from '../features/products/api/keySpecsApi'
import { useClassificationTree, useMissingKeySpecs } from '../features/products/hooks/useKeySpecs'
import { ProductPhotosSection } from '../features/products/sheet/ProductPhotosSection'
import { ProductSheetScope, SheetSlot } from '../features/products/sheet/ProductSheetTab'
import { useOptionalSheetDraft } from '../features/products/sheet/SheetDraftContext'
import { saveEditorParts } from '../features/products/sheet/editor-save'
import { FeaturesBlock } from '../features/products/sheet/blocks/FeaturesBlock'
import { HighlightsBlock } from '../features/products/sheet/blocks/HighlightsBlock'
import { ResourcesBlock } from '../features/products/sheet/blocks/ResourcesBlock'
import { SpecGroupsBlock } from '../features/products/sheet/blocks/SpecGroupsBlock'
import { PDF_OPTIONAL_NOTICE } from '../features/products/sheet/document-assets'
import {
  WIZARD_STEPS,
  buildCreatePayload,
  checkIdentity,
  duplicateReferenceOf,
  isStepAvailable,
  nameForField,
  normalizeReference,
  parseWizardStep,
  pendingItems,
  type DuplicateReference,
  type WizardStepId,
} from '../features/products/wizard/product-wizard'

const LEAVE_PROMPT = 'Hay cambios sin guardar. ¿Salir y descartarlos?'
const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm disabled:bg-neutral-50 disabled:text-neutral-500'
const labelClass = 'block text-sm font-medium text-neutral-700 mb-1.5'
const hintClass = 'text-xs text-neutral-500 mt-1'

function wizardPath(productId: string | undefined, step: WizardStepId): string {
  return `${NEW_PRODUCT_PATH}${productId ? `/${encodeURIComponent(productId)}` : ''}?paso=${step}`
}

function StepPanel({ id, title, note, active, children }: { id: WizardStepId; title: string; note?: string; active: boolean; children: ReactNode }) {
  return (
    <section id={`paso-${id}`} hidden={!active} aria-labelledby={`paso-${id}-title`} className="biblioteca-editor__panel space-y-4">
      <div>
        <h3 id={`paso-${id}-title`} className="text-base font-semibold text-neutral-800">Paso {id}. {title}</h3>
        {note && <p className="mt-0.5 text-xs text-neutral-500">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** Key data the server still lists for the saved subcategory (same panel as the editor). */
function MissingKeySpecsBlock({ productId }: { productId: string }) {
  const missing = useMissingKeySpecs(productId)
  return <MissingKeySpecsPanel missing={missingList(missing.data)} loading={missing.isLoading} />
}

interface WizardBodyProps {
  product: Product | null
  brands: Brand[]
  step: WizardStepId
  onStep: (step: WizardStepId, productId?: string) => void
}

function WizardBody({ product, brands, step, onStep }: WizardBodyProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const draft = useOptionalSheetDraft()
  const classificationTree = useClassificationTree()

  const [reference, setReference] = useState('')
  const [newName, setNewName] = useState('')
  const [edits, setEdits] = useState<Partial<EditorValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateReference | null>(null)
  const [keySpecsDirty, setKeySpecsDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const baseline = useMemo<EditorValues | null>(
    () => (product ? { ...valuesOfProduct(product), name: nameForField(product) } : null),
    [product],
  )
  const current: EditorValues | null = baseline ? { ...baseline, ...edits } : null
  // A blank name stays pending: it is not a change and never an error.
  const changed: EditorField[] = baseline && current
    ? changedFields(baseline, current).filter((field) => !(field === 'name' && current.name.trim() === ''))
    : []
  const sheetDirty = Boolean(draft?.dirty)
  const hasUnsaved = changed.length > 0 || sheetDirty || keySpecsDirty

  useEffect(() => {
    if (!hasUnsaved) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  const identity = checkIdentity({ reference: product ? product.sku : reference, name: current ? current.name : newName })

  const create = useMutation({
    mutationFn: async () => (await api.post('/products', buildCreatePayload({ reference, name: newName }))).data as Product,
  })
  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put(`/products/${product?.id}`, payload),
  })

  const setField = <K extends EditorField>(field: K, value: EditorValues[K]) => {
    setEdits((prev) => ({ ...prev, [field]: value }))
    setFormError(null)
  }

  /** Saves the page fields (name, brand, subcategory, description). True when it was saved or nothing changed. */
  const saveDatos = async (): Promise<boolean> => {
    if (!product || !current) return false
    const problem = validateEditorValues(current, changed)
    if (problem) {
      setFormError(problem)
      return false
    }
    if (changed.length === 0) return true
    try {
      await update.mutateAsync(buildUpdatePayload(current, changed))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product', product.id] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: keySpecKeys.all(product.id) }),
      ])
      setEdits({})
      setFormError(null)
      return true
    } catch (error) {
      setFormError(classificationErrorMessage(error) ?? getApiErrorMessage(error, 'No se pudieron guardar los datos.'))
      return false
    }
  }

  /** Same order as the editor's save bar: page fields first, then the store sheet. */
  const saveAll = (): Promise<boolean> =>
    saveEditorParts({
      datosDirty: changed.length > 0,
      sheetDirty,
      syncName: changed.includes('name') && current ? current.name.trim() : undefined,
      saveDatos,
      saveSheet: (options) => (draft ? draft.handleSubmit({ preventDefault: () => undefined }, options) : Promise.resolve(false)),
    })

  /** The first save creates the draft; every later save updates it. Then it moves to the next step. */
  const saveAndContinue = async (next: WizardStepId | null) => {
    setBusy(true)
    setDuplicate(null)
    try {
      if (!product) {
        if (identity.referenceError) {
          setFormError(identity.referenceError)
          return
        }
        try {
          const created = await create.mutateAsync()
          queryClient.setQueryData(['product', created.id], created)
          await queryClient.invalidateQueries({ queryKey: ['products'] })
          onStep(next ?? 1, created.id)
        } catch (error) {
          const dup = duplicateReferenceOf(error)
          if (dup) setDuplicate(dup)
          else setFormError(classificationErrorMessage(error) ?? getApiErrorMessage(error, 'No se pudo crear el producto.'))
        }
        return
      }
      if ((await saveAll()) && next) onStep(next)
    } finally {
      setBusy(false)
    }
  }

  const leave = () => {
    if (!hasUnsaved || window.confirm(LEAVE_PROMPT)) navigate(LIBRARY_QUEUE_PATH)
  }
  const guardLink = (event: { preventDefault: () => void }) => {
    if (hasUnsaved && !window.confirm(LEAVE_PROMPT)) event.preventDefault()
  }

  const nextStep = (step < 5 ? step + 1 : null) as WizardStepId | null
  const hasHighlights = Boolean(draft?.form.highlights.some((row) => row.value.trim() !== ''))
  const pending = product ? pendingItems(product, hasHighlights) : []
  const productExists = Boolean(product)

  return (
    <div className="biblioteca-editor space-y-6">
      <header className="space-y-3">
        <nav aria-label="Ruta de navegación">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
            <li className="flex items-center gap-1.5">
              <Link to={LIBRARY_QUEUE_PATH} className="hover:text-security-600" onClick={guardLink}>Fichas de producto</Link>
              <span aria-hidden="true">›</span>
            </li>
            <li aria-current="page" className="text-neutral-700">Nuevo producto</li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="biblioteca-editor__title">Nuevo producto</h2>
          <Badge variant="warning">Borrador</Badge>
        </div>
        <p className="text-sm text-neutral-600">
          Guarda en cualquier paso y sigue después. Siempre queda como borrador: nada se publica desde aquí y los datos se pueden completar luego en la ficha.
        </p>
      </header>

      <nav aria-label="Pasos para crear el producto">
        <ol className="flex flex-wrap gap-2">
          {WIZARD_STEPS.map((item) => {
            const available = isStepAvailable(item.id, productExists)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!available}
                  aria-current={step === item.id ? 'step' : undefined}
                  title={available ? undefined : 'Primero guarda el paso 1 para crear el borrador.'}
                  onClick={() => onStep(item.id)}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${step === item.id ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] font-semibold text-[var(--color-primary)]' : 'border-neutral-300 bg-white text-neutral-700'}`}
                >
                  {item.id}. {item.label}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <main className="space-y-6">
        <StepPanel id={1} title="Identidad" note="Solo la referencia es obligatoria. El nombre puede quedar pendiente." active={step === 1}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="wizard-reference">Referencia (obligatoria)</label>
              {product ? (
                <p id="wizard-reference" className="rounded-lg bg-neutral-50 px-3 py-2.5 font-mono text-sm text-neutral-700" data-testid="wizard-reference-readonly">{product.sku}</p>
              ) : (
                <input
                  id="wizard-reference"
                  type="text"
                  value={reference}
                  onChange={(event) => { setReference(event.target.value); setFormError(null); setDuplicate(null) }}
                  className={inputClass}
                  autoComplete="off"
                />
              )}
              <p className={hintClass}>
                {product
                  ? 'La referencia ya quedó guardada y no se cambia aquí.'
                  : reference.trim() ? `Se guardará como ${normalizeReference(reference)} (sin espacios y en mayúsculas).` : 'Es el código con el que se identifica el producto. No puede repetirse.'}
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="wizard-name">Nombre (opcional)</label>
              <input
                id="wizard-name"
                type="text"
                value={current ? current.name : newName}
                onChange={(event) => (current ? setField('name', event.target.value) : setNewName(event.target.value))}
                className={inputClass}
              />
              <p className={hintClass}>Si lo dejas vacío, el producto queda con el nombre pendiente.</p>
              {identity.nameWarning && <p className="mt-1 text-xs text-amber-700" role="status">{identity.nameWarning}</p>}
            </div>
          </div>
          {duplicate && (
            <Alert variant="error">
              <span className="block">{duplicate.message}</span>
              {duplicate.existingProductId && (
                <Link to={sheetEditorPath(duplicate.existingProductId)} className="mt-1 inline-block font-medium underline" onClick={guardLink}>Abrir el producto que ya existe</Link>
              )}
            </Alert>
          )}
        </StepPanel>

        {product && current && baseline && (
          <>
            <StepPanel id={2} title="Marca y clasificación" note="Se eligen de las que ya existen. Aquí no se crean marcas ni subcategorías." active={step === 2}>
              <div>
                <label className={labelClass} htmlFor="wizard-brand">Marca (opcional)</label>
                <select id="wizard-brand" value={current.brandId} onChange={(event) => setField('brandId', event.target.value)} className={inputClass}>
                  <option value="">Sin marca todavía</option>
                  {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
                <p className={hintClass}>Si no está la marca, pide que la agreguen en Catálogos maestros y vuelve a esta ficha.</p>
              </div>
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
                onChange={(subcategoryId) => setField('subcategoryId', subcategoryId)}
              />
            </StepPanel>

            <StepPanel id={3} title="Contenido y datos técnicos" note="Todo es opcional por ahora; lo que falte quedará en el resumen." active={step === 3}>
              <div>
                <label className={labelClass} htmlFor="wizard-description">Descripción</label>
                <textarea id="wizard-description" rows={4} value={current.description} onChange={(event) => setField('description', event.target.value)} className={`${inputClass} resize-y`} />
              </div>
              <SheetSlot>
                <div className="space-y-6">
                  <div className="space-y-2"><h4 className="text-sm font-semibold text-neutral-800">Destacados</h4><HighlightsBlock /></div>
                  <div className="space-y-2"><h4 className="text-sm font-semibold text-neutral-800">Características</h4><FeaturesBlock /></div>
                  <div className="space-y-2"><h4 className="text-sm font-semibold text-neutral-800">Especificaciones</h4><SpecGroupsBlock /></div>
                </div>
              </SheetSlot>
              <div className="space-y-2 border-t border-neutral-200 pt-4">
                <h4 className="text-sm font-semibold text-neutral-800">Datos clave</h4>
                <p className={hintClass}>Los que pide la subcategoría. Cada dato puede ser conocido, no aplica o desconocido. Se guardan con su propio botón.</p>
                <KeySpecsSection
                  productId={product.id}
                  savedSubcategoryId={baseline.subcategoryId}
                  subcategoryUnsaved={current.subcategoryId !== baseline.subcategoryId}
                  canEdit
                  onDirtyChange={setKeySpecsDirty}
                />
              </div>
            </StepPanel>

            <StepPanel id={4} title="Imágenes y recursos" note="Las fotos se guardan al instante." active={step === 4}>
              <ProductPhotosSection product={product} />
              <div className="space-y-2 border-t border-neutral-200 pt-4">
                <h4 className="text-sm font-semibold text-neutral-800">Recursos para descargar</h4>
                <p className={hintClass}>
                  Un enlace (URL) lleva a un archivo que está en otro sitio: si ese sitio lo cambia o lo borra, deja de abrir. Un archivo adjunto se guarda aquí y siempre estará disponible. {PDF_OPTIONAL_NOTICE}
                </p>
                <SheetSlot><ResourcesBlock /></SheetSlot>
              </div>
            </StepPanel>

            <StepPanel id={5} title="Resumen de faltantes y guardado" note="Esto es lo que revisión y publicación van a pedir. Nada de esto impide guardar." active={step === 5}>
              {pending.length === 0 ? (
                <p className="text-sm text-neutral-600" role="status">No faltan datos básicos.</p>
              ) : (
                <section aria-label="Datos que faltan" className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4" data-testid="wizard-pending">
                  <h4 className="text-sm font-semibold text-neutral-800">{pending.length === 1 ? 'Falta 1 cosa' : `Faltan ${pending.length} cosas`}</h4>
                  <ul className="space-y-1">
                    {pending.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                        <span>{item.text}</span>
                        <button type="button" className="text-security-600 underline" onClick={() => onStep(item.step)}>Ir al paso {item.step}</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {step === 5 && <MissingKeySpecsBlock productId={product.id} />}
              {keySpecsDirty && <Alert variant="warning">Hay datos clave sin guardar. Guárdalos en el paso 3 con su botón.</Alert>}
              <p className="text-sm text-neutral-600">El producto queda como borrador. Para enviarlo a revisión o publicarlo, usa la ficha completa cuando esté listo.</p>
              <Link to={sheetEditorPath(product.id)} className="inline-block text-sm font-medium text-security-600 underline" onClick={guardLink}>Abrir en la ficha completa</Link>
            </StepPanel>
          </>
        )}
      </main>

      {formError && <Alert variant="error">{formError}</Alert>}
      {draft?.saveError && <Alert variant="error">{draft.saveError}</Alert>}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={leave}>Salir</Button>
          {step > 1 && <Button variant="secondary" disabled={busy} onClick={() => onStep((step - 1) as WizardStepId)}>Anterior</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-neutral-600" role="status">{busy ? 'Guardando…' : hasUnsaved ? 'Hay cambios sin guardar' : product ? 'Guardado' : 'Aún no se ha creado el borrador'}</span>
          {step < 5 ? (
            <Button loading={busy} disabled={!product && Boolean(identity.referenceError)} onClick={() => void saveAndContinue(nextStep)}>
              {product ? 'Guardar y continuar' : 'Guardar y crear borrador'}
            </Button>
          ) : (
            <Button loading={busy} disabled={!hasUnsaved} onClick={() => void saveAndContinue(null)}>Guardar</Button>
          )}
        </div>
      </footer>
    </div>
  )
}

export default function LibraryProductWizardPage() {
  const { productId } = useParams<{ productId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const step = parseWizardStep(searchParams.get('paso'))

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => (await api.get(`/products/${productId}`)).data as Product,
    enabled: Boolean(productId),
  })
  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: async () => (await api.get('/brands')).data.data as Brand[],
  })

  const onStep = (next: WizardStepId, id?: string) => navigate(wizardPath(id ?? productId, next), { replace: Boolean(id) })

  if (productId && productQuery.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-neutral-100" role="status" aria-busy="true"><span className="sr-only">Cargando producto…</span></div>
  }
  if (productId && !productQuery.data) {
    return (
      <Card className="py-10 text-center">
        <p className="font-medium text-neutral-700">No encontramos este borrador</p>
        <Link to={LIBRARY_QUEUE_PATH} className="mt-2 inline-block text-sm text-security-600 underline">Volver a Fichas de producto</Link>
      </Card>
    )
  }

  const product = productQuery.data ?? null
  const body = <WizardBody key={product?.id ?? 'new'} product={product} brands={brandsQuery.data ?? []} step={isStepAvailable(step, Boolean(product)) ? step : 1} onStep={onStep} />
  return product
    ? <ProductSheetScope productId={product.id} lifecycleStatus={product.lifecycleStatus ?? null}>{body}</ProductSheetScope>
    : body
}
