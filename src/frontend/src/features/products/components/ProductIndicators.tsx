import type { Product } from '../types/product.types'

// ------------------------------ Badge de publicación ------------------------------
export function PublishBadge({ product }: { product: Product }) {
  const status = product.publishStatus
  if (!status) return null
  const scheduled = Boolean(product.publishAt) && status === 'listo'

  let label: string
  let classes: string
  if (status === 'publicado') {
    label = 'PUBLICADO'
    classes = 'bg-emerald-100 text-emerald-700'
  } else if (scheduled || status === 'programado') {
    label = 'PROGRAMADO'
    classes = 'bg-blue-100 text-blue-700'
  } else if (status === 'listo') {
    label = 'LISTO'
    classes = 'bg-amber-100 text-amber-700'
  } else if (status === 'archivado') {
    label = 'ARCHIVADO'
    classes = 'bg-gray-700 text-gray-100'
  } else {
    label = 'BORRADOR'
    classes = 'bg-gray-200 text-gray-600'
  }

  return (
    <span
      title={
        scheduled && product.publishAt
          ? `Publicación programada: ${new Date(product.publishAt).toLocaleString()}`
          : product.unpublishReason
            ? `Motivo de despublicación: ${product.unpublishReason}`
            : label
      }
      className={`px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  )
}

// ------------------------------ Badge de stock ------------------------------
export function StockBadge({ product }: { product: Product }) {
  const status = product.stockStatus
  const qty = product.availableQty

  if (!status && qty == null) return null

  let label: string
  let classes: string
  if (status === 'out_of_stock' || (status === undefined && qty != null && qty <= 0)) {
    label = 'SIN STOCK'
    classes = 'bg-red-100 text-red-700'
  } else if (status === 'no_stock_data') {
    label = 'SIN DATOS'
    classes = 'bg-gray-100 text-gray-600'
  } else {
    label = 'STOCK OK'
    classes = 'bg-emerald-100 text-emerald-700'
  }

  return (
    <span
      title={qty != null ? `Disponible: ${qty}` : 'Disponibilidad no registrada'}
      className={`px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  )
}

// ------------------------------ Puntos de estado compactos (tarjetas) ------------------------------
// Mismo significado que los badges, sin texto visible: color + título al pasar el cursor + texto para lectores de pantalla.
function StatusDot({ label, detail, dotClass }: { label: string; detail: string; dotClass: string }) {
  return (
    <span title={`${label}: ${detail}`} className="inline-flex h-4 w-4 items-center justify-center cursor-help">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      <span className="sr-only">{`${label}: ${detail}`}</span>
    </span>
  )
}

export function StockDot({ product }: { product: Product }) {
  const status = product.stockStatus
  const qty = product.availableQty
  if (!status && qty == null) return null
  if (status === 'out_of_stock' || (status === undefined && qty != null && qty <= 0)) {
    return <StatusDot label="Stock" detail="Sin stock" dotClass="bg-red-500" />
  }
  if (status === 'no_stock_data') {
    return <StatusDot label="Stock" detail="Disponibilidad no registrada" dotClass="bg-gray-300" />
  }
  return <StatusDot label="Stock" detail={qty != null ? `Disponible (${qty})` : 'Disponible'} dotClass="bg-emerald-500" />
}

export function PublishDot({ product }: { product: Product }) {
  const status = product.publishStatus
  if (!status) return null
  const scheduled = Boolean(product.publishAt) && status === 'listo'
  if (status === 'publicado') return <StatusDot label="Publicación" detail="Publicado" dotClass="bg-emerald-500" />
  if (scheduled || status === 'programado') return <StatusDot label="Publicación" detail="Programado" dotClass="bg-blue-500" />
  if (status === 'listo') return <StatusDot label="Publicación" detail="Listo para publicar" dotClass="bg-amber-500" />
  if (status === 'archivado') return <StatusDot label="Publicación" detail="Archivado" dotClass="bg-gray-700" />
  return <StatusDot label="Publicación" detail="Borrador" dotClass="bg-gray-400" />
}

// ------------------------------ Badge de imagen ------------------------------
export function ImageBadge({ product }: { product: Product }) {
  if (!product.images || product.images.length === 0) {
    return (
      <span
        title="El producto no tiene imagen principal cargada"
        className="px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide whitespace-nowrap bg-orange-100 text-orange-700"
      >
        SIN IMAGEN
      </span>
    )
  }
  return null
}

// ------------------------------ Icono de acceso restringido ------------------------------
interface AccessIndicatorProps {
  restricted?: boolean
  unavailable?: boolean
}

export function AccessIndicator({ restricted = false, unavailable = false }: AccessIndicatorProps) {
  if (!restricted && !unavailable) return null
  return (
    <span
      title={
        unavailable
          ? 'Disponible próximamente'
          : 'El producto tiene asignaciones de acceso (lista/usuarios configurados)'
      }
      className={`inline-flex items-center justify-center p-1 rounded-full cursor-help ${
        restricted ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    </span>
  )
}

// ------------------------------ Bloque completo de indicadores ------------------------------
interface ProductIndicatorsProps {
  product: Product
  restricted?: boolean
  accessUnavailable?: boolean
}

export function ProductIndicators({ product, restricted = false, accessUnavailable = false }: ProductIndicatorsProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <ImageBadge product={product} />
      <StockBadge product={product} />
      <PublishBadge product={product} />
      <AccessIndicator restricted={restricted} unavailable={accessUnavailable} />
    </div>
  )
}