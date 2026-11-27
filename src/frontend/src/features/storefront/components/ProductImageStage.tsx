import { useState, type ReactNode } from 'react'

/**
 * PERMANENT DESIGN RULE (decided by the owner, 2026-11-27): every place of the public store and the customer
 * portal that shows a PRODUCT photo uses this "stage": a light-grey spotlight behind the photo, the photo with
 * `mix-blend-mode: multiply` and `object-fit: contain`, a thin grey card border, and a white title strip with a
 * lighter top border. Product photos have a white background, so `multiply` lets the white melt into the grey.
 * Do not hard-code another background for a product photo; change the values below instead, and only when the
 * owner asks. Not covered: banners, campaign flyers, logos, category photos and internal staff panels.
 * The rule is also written in docs/design/product-image-stage.md.
 */
export const PRODUCT_STAGE_BG = 'bg-[radial-gradient(ellipse_at_50%_45%,#f6f5f5_0%,#d0cece_130%)]'
export const PRODUCT_STAGE_BLEND = 'mix-blend-multiply'
/** Thin border of the card that holds a stage. */
export const PRODUCT_STAGE_BORDER = 'border-[#c4c2c2]'
/** Top border of the white title strip under the stage. */
export const PRODUCT_STAGE_TITLE_BORDER = 'border-[#e3e6ec]'
/** Links and "›" arrows next to the stage: darker red so small text passes contrast (pure red stays for logo/large details). */
export const PRODUCT_STAGE_LINK = 'text-[#b30000]'

interface ProductImageStageProps {
  /** Resolved image URL; null shows `fallback`. */
  src: string | null
  alt?: string
  /** Size classes; the default is a 4/3 frame as wide as its card. */
  sizeClass?: string
  padding?: string
  eager?: boolean
  className?: string
  /** Shown when there is no image or it failed to load. */
  fallback?: ReactNode
}

/**
 * The photo is taken out of the flow (`absolute inset-0`) so its own proportions can never stretch the frame:
 * every stage of the same `sizeClass` is exactly the same box.
 */
export default function ProductImageStage({
  src,
  alt = '',
  sizeClass = 'aspect-[4/3] w-full',
  padding = 'p-3',
  eager = false,
  className = '',
  fallback = null,
}: ProductImageStageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src !== null && failedSrc !== src

  return (
    <span className={`relative block ${sizeClass} shrink-0 overflow-hidden ${PRODUCT_STAGE_BG} ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailedSrc(src)}
          className={`absolute inset-0 h-full w-full object-contain ${PRODUCT_STAGE_BLEND} ${padding}`}
        />
      ) : (
        fallback
      )}
    </span>
  )
}
