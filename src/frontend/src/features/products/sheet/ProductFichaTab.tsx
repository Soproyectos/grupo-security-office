import { useCallback, useEffect, useRef, useState } from 'react'
import type { Brand, Category, Product } from '../types/product.types'
import { FichaSection } from './FichaSection'
import { ProductAttributesSection } from './ProductAttributesSection'
import { ProductDocumentsSection } from './ProductDocumentsSection'
import { ProductGeneralInfoSection } from './ProductGeneralInfoSection'
import { ProductPhotosSection } from './ProductPhotosSection'
import { SHEET_SECTIONS } from './ProductSheetEditor'
import { ProductSheetTab } from './ProductSheetTab'

interface ProductFichaTabProps {
  product: Product
  categories: Category[]
  brands: Brand[]
  /** Opened from a Lista (operational). Without it the catalog view is read-only general info. */
  isContextual: boolean
  /** The public sheet is only editable by users with write permission. */
  canEditSheet: boolean
  /** Reports unsaved edits in any block so the page can warn before leaving the tab. */
  onDirtyChange?: (dirty: boolean) => void
}

type DirtyKey = 'info' | 'attributes' | 'sheet'

const NAV_BEFORE = [
  { id: 'informacion', label: 'Información general' },
  { id: 'fotos', label: 'Fotos' },
] as const
const NAV_AFTER = [{ id: 'atributos', label: 'Atributos' }] as const

/**
 * The single editing surface of a product: general information, photos, the public sheet
 * (identity, highlights, specifications, documents…) and basic attributes. Each block keeps
 * its own save mechanism and says so on its button.
 */
export function ProductFichaTab({
  product,
  categories,
  brands,
  isContextual,
  canEditSheet,
  onDirtyChange,
}: ProductFichaTabProps) {
  const [dirty, setDirty] = useState<Record<DirtyKey, boolean>>({ info: false, attributes: false, sheet: false })
  const anyDirty = dirty.info || dirty.attributes || dirty.sheet
  const anyDirtyRef = useRef(false)

  useEffect(() => {
    anyDirtyRef.current = anyDirty
    onDirtyChange?.(anyDirty)
  }, [anyDirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // The sheet block registers its own unload warning; this one covers the other blocks.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!anyDirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const setInfoDirty = useCallback((value: boolean) => setDirty((prev) => (prev.info === value ? prev : { ...prev, info: value })), [])
  const setAttributesDirty = useCallback(
    (value: boolean) => setDirty((prev) => (prev.attributes === value ? prev : { ...prev, attributes: value })),
    [],
  )
  const setSheetDirty = useCallback((value: boolean) => setDirty((prev) => (prev.sheet === value ? prev : { ...prev, sheet: value })), [])

  const nav = [
    ...NAV_BEFORE.filter((s) => s.id !== 'fotos' || isContextual),
    ...(isContextual && canEditSheet ? SHEET_SECTIONS : []),
    ...(isContextual ? NAV_AFTER : []),
  ]

  return (
    <div className="space-y-6">
      {nav.length > 1 && (
        <nav aria-label="Secciones de la ficha" className="flex gap-1 flex-wrap">
          {nav.map((s) => (
            <a key={s.id} href={`#ficha-${s.id}`} className="px-3 py-1.5 text-xs rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50">
              {s.label}
            </a>
          ))}
        </nav>
      )}

      <FichaSection
        id="informacion"
        title="Información general"
        hint={isContextual ? 'SKU, nombre, descripción, categoría y marca del producto. Se guarda con el botón de esta sección.' : undefined}
      >
        <ProductGeneralInfoSection
          product={product}
          categories={categories}
          brands={brands}
          readOnly={!isContextual}
          onDirtyChange={setInfoDirty}
        />
        {isContextual && (
          <div className="border-t border-neutral-200 pt-4">
            <ProductDocumentsSection product={product} />
          </div>
        )}
      </FichaSection>

      {isContextual && (
        <FichaSection id="fotos" title="Fotos" hint="Imágenes del producto en la tienda y en las cotizaciones.">
          <ProductPhotosSection product={product} />
        </FichaSection>
      )}

      {isContextual && canEditSheet && (
        <ProductSheetTab
          productId={product.id}
          lifecycleStatus={product.lifecycleStatus ?? null}
          onDirtyChange={setSheetDirty}
          hideNav
        />
      )}

      {isContextual && (
        <FichaSection
          id="atributos"
          title="Atributos"
          hint="Especificaciones básicas del producto. La ficha pública las muestra solo si no hay grupos en «Especificaciones». Se guardan con el botón de esta sección."
        >
          <ProductAttributesSection product={product} onDirtyChange={setAttributesDirty} />
        </FichaSection>
      )}
    </div>
  )
}
