interface ProductCardProps {
  brand: string
  name: string
  sku: string
  tag?: string
  stock: string
  stockColor: string
}

export default function ProductCard({
  brand,
  name,
  sku,
  tag,
  stock,
  stockColor,
}: ProductCardProps) {
  const isOutOfStock = stock === 'Agotado'

  return (
    <div
      className="bg-white rounded-[14px] overflow-hidden relative"
      style={{ backgroundColor: '#fff' }}
    >
      {/* Tag */}
      {tag && (
        <span
          className="absolute top-2.5 left-2.5 text-white font-bold text-[9.5px] px-2 py-0.5 rounded z-10"
          style={{
            backgroundColor: tag === 'NUEVO' ? '#484748' : '#059669',
          }}
        >
          {tag}
        </span>
      )}

      {/* Image placeholder */}
      <div
        className="aspect-square flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg,#F8FAFC,#E2E8F0)',
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94A3B8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="p-3">
        <p className="m-0 text-[9.5px] font-bold text-security-500 uppercase">
          {brand}
        </p>
        <p
          className="m-0 mt-0.75 text-[12.5px] text-[#1A1A1A] leading-[1.3]"
          style={{ minHeight: '32px' }}
        >
          {name}
        </p>
        <p className="m-0 mt-0.75 text-[10px] text-ink-400" style={{ fontFamily: 'monospace' }}>
          SKU {sku}
        </p>
        <p className="m-0 mt-2 text-[10px] font-semibold" style={{ color: stockColor }}>
          ● {stock}
        </p>
        <a
          href="/tienda/login"
          className="block text-center mt-2 text-[11.5px] font-bold text-white rounded-lg py-2 hover:opacity-90"
          style={{
            backgroundColor: isOutOfStock ? '#94A3B8' : '#CE0203',
          }}
        >
          {isOutOfStock ? 'Avísame cuando llegue' : 'Ver precio'}
        </a>
      </div>
    </div>
  )
}
