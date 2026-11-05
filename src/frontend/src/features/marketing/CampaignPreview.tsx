import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useWideScreen } from '../../components/ui/useWideScreen'
import { PREVIEW_DATA, PREVIEW_PATH, PREVIEW_READY, readLayoutMessage, type PreviewLayout } from '../storefront/utils/preview-frame'
import {
  CAMPAIGN_IMAGE_RULES,
  PREVIEW_CANVAS_WIDTH,
  draftToCampaigns,
  emptyPreviewText,
  measureGuideText,
  previewScale,
  type CampaignFit,
  type CampaignKind,
  type CampaignSlot,
  type PreviewDevice,
} from './marketing-rules'

/** Measures of one image slot: recommended size, minimum width, ratio range, weight and formats. */
export function MeasureGuide({ slot }: { slot: CampaignSlot }) {
  return (
    <p className="text-xs text-[var(--color-text-secondary)]" data-testid={`measure-guide-${slot}`}>
      <span className="font-semibold">Medidas ({CAMPAIGN_IMAGE_RULES[slot].title.toLowerCase()}):</span> {measureGuideText(slot)}
    </p>
  )
}

const DEVICES: ReadonlyArray<{ id: PreviewDevice; label: string }> = [
  { id: 'desktop', label: 'Escritorio' },
  { id: 'mobile', label: 'Móvil' },
]

export interface PreviewProps {
  kind: CampaignKind
  alt: string
  fit: CampaignFit
  focusX: number
  focusY: number
  fitMobile?: CampaignFit
  focusMobileX?: number
  focusMobileY?: number
  imageDesktop: string | null
  imageMobile: string | null
  image: string | null
  /** Device the preview starts on: Móvil in the compact (narrow screen) layout, Escritorio otherwise. */
  initialDevice?: PreviewDevice
}

/**
 * Live preview: the real home page of the store (`/tienda`) in a same-origin iframe that receives
 * the draft by postMessage. An iframe, and not the page rendered in this window, because the
 * mobile breakpoints depend on the window width: at 390 px the page answers as on a phone. The
 * frame is scaled down to fit and can be scrolled (wheel, touch, or keys on its region) but not
 * used: inside it the page swallows clicks, submits and keys, makes no campaign request, shows the
 * pop-up at once and does not mark it as seen.
 *
 * Below 1024 px (compact) the preview sits above the form: it starts on Móvil, can be hidden, and
 * shows the store header over the banner, whole (the page reports where the banner is).
 */
export default function CampaignPreview(props: PreviewProps) {
  const { kind, initialDevice } = props
  const wide = useWideScreen()
  const compact = !wide
  const [device, setDevice] = useState<PreviewDevice>(initialDevice ?? (wide ? 'desktop' : 'mobile'))
  const [expanded, setExpanded] = useState(true)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [layout, setLayout] = useState<PreviewLayout | null>(null)
  const [readyTick, setReadyTick] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const boxId = useId()

  const visible = wide || expanded
  const align = compact || device === 'mobile' ? 'banner' : 'top'
  const payload = JSON.stringify(draftToCampaigns(props))

  useEffect(() => {
    const box = boxRef.current
    if (!visible || !box || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setSize({ width: box.clientWidth, height: box.clientHeight }))
    observer.observe(box)
    setSize({ width: box.clientWidth, height: box.clientHeight })
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow
      if (!frame || event.origin !== window.location.origin || event.source !== frame) return
      if ((event.data as { type?: unknown } | null)?.type === PREVIEW_READY) setReadyTick((value) => value + 1)
      const next = readLayoutMessage(event, frame)
      if (next) setLayout(next)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, campaigns: JSON.parse(payload), align }, window.location.origin)
  }, [payload, align, readyTick, visible])

  const canvas = PREVIEW_CANVAS_WIDTH[device]
  // Narrow screens: zoom so the banner alone fills the width and is shown whole.
  const fitBanner = compact && kind === 'HERO' && layout !== null
  const scale = previewScale(size.width, fitBanner ? layout.width : canvas)
  const left = fitBanner ? -layout.left * scale : Math.max(0, (size.width - canvas * scale) / 2)
  const frameHeight = size.height > 0 ? size.height / scale : 800
  const boxHeight = compact ? `min(${fitBanner ? Math.ceil((layout.headerHeight + layout.height) * scale) : 420}px, 55vh)` : undefined
  // The page inside can be scrolled but not used; keys scroll it from the focusable region.
  const onBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const page = frameRef.current?.contentWindow
    if (!page || event.target !== event.currentTarget) return
    const step = Math.max(80, size.height * 0.85)
    const moves: Record<string, () => void> = {
      ArrowDown: () => page.scrollBy(0, 60),
      ArrowUp: () => page.scrollBy(0, -60),
      PageDown: () => page.scrollBy(0, step),
      PageUp: () => page.scrollBy(0, -step),
      ' ': () => page.scrollBy(0, event.shiftKey ? -step : step),
      Home: () => page.scrollTo(0, 0),
      End: () => page.scrollTo(0, page.document.documentElement.scrollHeight),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    move()
  }
  const hint = emptyPreviewText(kind, kind === 'POPUP' ? !!props.image : !!props.imageDesktop)

  return (
    <section aria-label={kind === 'POPUP' ? 'Vista previa del pop-up' : 'Vista previa del banner'} className={`flex h-full flex-col gap-3 rounded-xl bg-white shadow-xl ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Vista previa: así se verá hoy en la tienda</h3>
        <div className="flex flex-wrap items-center gap-2">
          {compact && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={boxId}
              onClick={() => setExpanded((value) => !value)}
              className="min-h-[44px] rounded-lg border border-[var(--color-border)] px-3 text-sm hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              {expanded ? 'Ocultar vista previa' : 'Mostrar vista previa'}
            </button>
          )}
          <div role="group" aria-label="Tamaño de pantalla de la vista previa" className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
            {DEVICES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={device === id}
                onClick={() => setDevice(id)}
                className={`min-h-[44px] px-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${device === id ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {visible && hint && <p data-testid="preview-empty" className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">{hint}</p>}
      {visible && (
        <div
          id={boxId}
          ref={boxRef}
          role="region"
          aria-label="Vista previa de la tienda, solo lectura"
          tabIndex={0}
          onKeyDown={onBoxKeyDown}
          className="relative min-h-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] lg:flex-1"
          style={boxHeight ? { height: boxHeight } : undefined} data-testid="preview-viewport">
          <iframe
            ref={frameRef}
            src={PREVIEW_PATH}
            title="Portada de la tienda con el borrador"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute top-0 border-0 bg-white"
            style={{ width: canvas, height: frameHeight, left, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
        </div>
      )}
      {visible && wide && <p className="text-xs text-[var(--color-text-secondary)]">Es la portada real de la tienda, solo para mirar: puedes desplazarla, pero no abrir ni cerrar nada.</p>}
    </section>
  )
}
