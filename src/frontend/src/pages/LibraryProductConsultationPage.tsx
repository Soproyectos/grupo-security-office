import { useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button } from '../components/ui'
import { ImageViewer } from '../components/ui/ImageViewer'
import { revealIfAbove, scrollBehavior } from '../lib/scroll'
import api, { resolveAssetUrl } from '../services/api'
import { getApiErrorMessage } from '../lib/apiError'
import { formatDate } from '../lib/format'
import { useHasPermission } from '../lib/rbac'
import type { Product } from '../features/products/types/product.types'
import type { ProductSheetApi } from '../features/products/sheet/sheet-form'
import { fetchProductSheet, sheetKeys } from '../features/products/sheet/sheet.service'
import { effectiveLifecycleStatus, LIFECYCLE_STATUS_LABEL } from '../features/products/lib/lifecycle'
import { ProductPricesSection } from '../features/products/prices/ProductPricesSection'
import { ProductResources } from '../features/products/components/ProductResources'
import { reviewResources } from '../features/catalog-publication/review-resources'
import './LibraryProductConsultationPage.css'

type Section = 'information' | 'prices' | 'files'

function displayValue(value: unknown): string {
  if (value == null || value === '') return 'Sin información'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${displayValue(item)}`).join(' · ')
  return String(value)
}

function PropertyRows({ values }: { values: Record<string, unknown> }) {
  return <dl className="library-consultation__properties">{Object.entries(values).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
}

export function ConsultationInformation({ product, sheet }: { product: Product; sheet?: ProductSheetApi }) {
  const technical = product.technicalSpecs ?? {}
  const extra = product.extraAttributes ?? {}
  return (
    <div className="library-consultation__information">
      <div className="library-consultation__main-information">
        <section><h3>Descripción del producto</h3><p className="library-consultation__prose">{product.description || 'Este producto todavía no tiene una descripción.'}</p></section>
        {Boolean(sheet?.features.length) && <section><h3>Características</h3><ul className="library-consultation__features">{sheet?.features.map((feature) => <li key={feature.id}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>{feature.label}</li>)}</ul></section>}
        {Boolean(sheet?.specGroups.length) && <section><h3>Especificaciones</h3>{sheet?.specGroups.map((group) => <div className="library-consultation__spec-group" key={group.key}><h4>{group.title}</h4><dl className="library-consultation__properties">{group.items.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></div>)}{sheet?.specsDisclaimer && <p className="library-consultation__note">{sheet.specsDisclaimer}</p>}</section>}
        {Object.keys(technical).length > 0 && <section><h3>Datos técnicos del producto</h3><PropertyRows values={technical} /></section>}
        {Object.keys(extra).length > 0 && <section><h3>Atributos adicionales</h3><PropertyRows values={extra} /></section>}
      </div>
      <aside className="library-consultation__catalog-data" aria-label="Datos del catálogo">
        <h3>Datos del catálogo</h3>
        <dl><div><dt>Referencia</dt><dd>{product.sku}</dd></div><div><dt>Nombre del catálogo</dt><dd>{product.name}</dd></div><div><dt>Marca</dt><dd>{sheet?.brand || product.brand?.name || 'Sin marca'}</dd></div><div><dt>Categoría</dt><dd>{product.category?.name || 'Sin categoría'}</dd></div>{sheet?.model && <div><dt>Modelo</dt><dd>{sheet.model}</dd></div>}{Boolean(sheet?.availableModels.length) && <div><dt>Modelos disponibles</dt><dd>{sheet?.availableModels.join(', ')}</dd></div>}{Boolean(sheet?.manufacturerRefs.length) && <div><dt>Referencias del fabricante</dt><dd>{sheet?.manufacturerRefs.join(', ')}</dd></div>}<div><dt>Creado</dt><dd>{formatDate(product.createdAt)}</dd></div><div><dt>Última actualización</dt><dd>{formatDate(product.updatedAt)}</dd></div></dl>
      </aside>
    </div>
  )
}

export function ConsultationFiles({ product, sheet }: { product: Product; sheet?: ProductSheetApi }) {
  const resources = reviewResources(sheet)
  const resourceUrls = new Set((sheet?.resources ?? []).map((item) => resolveAssetUrl(item.url)))
  const additionalDocuments = (product.documents ?? []).filter((item) => !resourceUrls.has(resolveAssetUrl(item.url)))
  const hasResources = resources.documents.length > 0 || Boolean(resources.firmware?.files.length)
  return <section className="library-consultation__files"><h3>Archivos y documentos</h3><p className="library-consultation__note">Consulta la documentación técnica y los archivos asociados a esta referencia.</p>{hasResources && <ProductResources documents={resources.documents} firmware={resources.firmware} />}{additionalDocuments.length > 0 && <div className="library-consultation__additional-files"><h4>Otros archivos del producto</h4><ul>{additionalDocuments.map((document, index) => <li key={`${document.url}-${index}`}><a href={resolveAssetUrl(document.url)} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8M8 17h6" /></svg>{document.name}<span>Abrir archivo</span></a></li>)}</ul></div>}{!hasResources && additionalDocuments.length === 0 && <p className="library-consultation__empty">Este producto todavía no tiene archivos asociados.</p>}</section>
}

/** Explicit commercial fields only: internal notes and administrative actions
 * are never rendered here, including for users who can edit in other panels. */
export function ConsultationProduct({ product, sheet, canReadPrices, sheetLoading = false, sheetFailed = false, onRetrySheet }: {
  product: Product; sheet?: ProductSheetApi; canReadPrices: boolean; sheetLoading?: boolean; sheetFailed?: boolean; onRetrySheet?: () => void
}) {
  const [section, setSection] = useState<Section>('information')
  const [imageId, setImageId] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState('')
  const images = (product.images ?? []).filter((image) => image.url)
  const selectedImage = images.find((image) => image.id === imageId) ?? images.find((image) => image.isPrimary) ?? images[0]
  const imageUrl = selectedImage?.url || sheet?.imageUrl
  const [viewerOpen, setViewerOpen] = useState(false)
  const viewerIndex = Math.max(0, images.findIndex((image) => image.id === selectedImage?.id))
  const name = sheet?.name || product.name
  const viewerImages = images.length > 0
    ? images.map((image) => ({ id: image.id, src: resolveAssetUrl(image.url), alt: image.alt || name }))
    : imageUrl ? [{ id: 'sheet-image', src: resolveAssetUrl(imageUrl), alt: sheet?.imageAlt || name }] : []
  const status = effectiveLifecycleStatus(product)
  const tabs: { id: Section; label: string }[] = [{ id: 'information', label: 'Información' }, ...(canReadPrices ? [{ id: 'prices' as const, label: 'Precios' }] : []), { id: 'files', label: 'Archivos' }]
  const active = section === 'prices' && !canReadPrices ? 'information' : section
  const chooseWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    const target = tabs[next]
    if (!target) return
    setSection(target.id)
    document.getElementById(`consultation-tab-${target.id}`)?.focus()
  }
  const copySku = async () => {
    try { await navigator.clipboard.writeText(product.sku); setCopyNotice('Referencia copiada.') }
    catch { setCopyNotice('No se pudo copiar. Puedes seleccionar la referencia y copiarla manualmente.') }
  }
  const openSection = (next: Section) => {
    setSection(next)
    requestAnimationFrame(() => {
      const panel = document.getElementById(`consultation-panel-${next}`)
      panel?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
      panel?.focus({ preventScroll: true })
    })
  }
  return (
    <article className="library-consultation">
      <div className="library-consultation__navigation"><Link to="/commercial/products"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18" /></svg>Volver a Productos</Link><span>Solo consulta</span></div>
      <div className="library-consultation__hero">
        <section className="library-consultation__gallery" aria-label="Imágenes del producto">
          <div className="library-consultation__main-image">{imageUrl ? <button type="button" className="library-consultation__zoom" aria-label="Ampliar imagen" title="Clic para ampliar" onClick={() => setViewerOpen(true)}><img src={resolveAssetUrl(imageUrl)} alt={selectedImage?.alt || sheet?.imageAlt || name} /></button> : <div className="library-consultation__no-image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5m-9 5L3 8m9 5v9" /></svg><p>Imagen no disponible</p></div>}</div>
          {images.length > 1 && <div className="library-consultation__thumbnails">{images.map((image, index) => <button type="button" key={image.id} aria-label={`Ver imagen ${index + 1}`} aria-pressed={selectedImage?.id === image.id} onClick={() => setImageId(image.id)}><img src={resolveAssetUrl(image.url)} alt="" /></button>)}</div>}
          <ImageViewer images={viewerImages} index={viewerIndex} open={viewerOpen} onIndexChange={(i) => { const next = images[i]; if (next) setImageId(next.id) }} onClose={() => setViewerOpen(false)} />
        </section>
        <header className="library-consultation__identity">
          <h2>{name}</h2>
          <div className="library-consultation__reference"><span>SKU: <strong>{product.sku}</strong></span><button type="button" onClick={() => void copySku()} aria-label="Copiar referencia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 8V3h12v13h-5M3 8h13v13H3z" /></svg>Copiar</button></div>
          {copyNotice && <p role="status" className="library-consultation__note">{copyNotice}</p>}
          <div className="library-consultation__badges"><Badge variant={status === 'PUBLISHED' ? 'success' : 'neutral'}>{LIFECYCLE_STATUS_LABEL[status]}</Badge>{sheet?.status === 'DISCONTINUED' && <Badge variant="warning">Descontinuado</Badge>}{sheet?.badges.map((badge) => <Badge key={badge} variant="neutral">{badge}</Badge>)}</div>
          <dl className="library-consultation__identity-data"><div><dt>Marca</dt><dd>{sheet?.brand || product.brand?.name || 'Sin marca'}</dd></div><div><dt>Categoría</dt><dd>{product.category?.name || 'Sin categoría'}</dd></div>{sheet?.model && <div><dt>Modelo</dt><dd>{sheet.model}</dd></div>}</dl>
          {Boolean(sheet?.highlights.length) && <div className="library-consultation__highlights"><h3>Lo más destacado</h3><ul>{sheet?.highlights.map((highlight, index) => <li key={index}>{highlight}</li>)}</ul></div>}
          <div className="library-consultation__shortcuts">{canReadPrices && <button type="button" onClick={() => openSection('prices')}>Consultar precios</button>}<button type="button" onClick={() => openSection('files')}>Ver archivos</button></div>
        </header>
      </div>
      {sheetFailed && <Alert variant="warning">No se pudo cargar la ficha complementaria. Puedes seguir consultando los datos del producto. <button type="button" className="underline underline-offset-2" onClick={onRetrySheet}>Reintentar ficha</button></Alert>}
      <div className="library-consultation__detail">
        <div role="tablist" aria-label="Información del producto" className="library-consultation__tabs">{tabs.map((tab, index) => <button type="button" role="tab" id={`consultation-tab-${tab.id}`} key={tab.id} aria-selected={active === tab.id} aria-controls={`consultation-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={(event) => { setSection(tab.id); const bar = event.currentTarget.parentElement; requestAnimationFrame(() => revealIfAbove(bar)) }} onKeyDown={(event) => chooseWithKeyboard(event, index)}>{tab.label}</button>)}</div>
        <div role="tabpanel" id={`consultation-panel-${active}`} aria-labelledby={`consultation-tab-${active}`} tabIndex={0} className="library-consultation__panel">
          {sheetLoading && active !== 'prices' && <p role="status" className="library-consultation__note">Cargando información complementaria…</p>}
          {active === 'information' && <ConsultationInformation product={product} sheet={sheet} />}
          {active === 'prices' && canReadPrices && <section><h3>Precios y tarifas</h3><p className="library-consultation__note">Consulta los precios registrados y sus fechas de vigencia.</p><ProductPricesSection product={product} mode="readOnly" /></section>}
          {active === 'files' && !sheetLoading && <ConsultationFiles product={product} sheet={sheet} />}
        </div>
      </div>
    </article>
  )
}

export default function LibraryProductConsultationPage() {
  const { productId = '' } = useParams<{ productId: string }>()
  const canReadPrices = useHasPermission('prices:read')
  const product = useQuery({ queryKey: ['product', productId], queryFn: async () => (await api.get(`/products/${productId}`)).data as Product, enabled: Boolean(productId), retry: 1 })
  const sheet = useQuery({ queryKey: sheetKeys.detail(productId), queryFn: () => fetchProductSheet(productId), enabled: Boolean(productId) && product.isSuccess, retry: 1 })
  if (product.isPending) return <div className="library-consultation__loading" role="status" aria-label="Cargando producto"><div /><div /><p>Cargando producto…</p></div>
  if (product.isError || !product.data) return <div className="space-y-4"><Link to="/commercial/products" className="text-sm text-[var(--color-primary)] hover:underline">Volver a Productos</Link><Alert variant="error">{getApiErrorMessage(product.error, 'No se pudo cargar el producto.')}</Alert><Button variant="secondary" onClick={() => void product.refetch()}>Reintentar</Button></div>
  return <ConsultationProduct key={product.data.id} product={product.data} sheet={sheet.data} canReadPrices={canReadPrices} sheetLoading={sheet.isPending} sheetFailed={sheet.isError} onRetrySheet={() => void sheet.refetch()} />
}
